import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  addMonths,
  initialState,
  key,
  parseKey,
  resetGoal,
  today,
  type GoalEdit,
  type SetupInput,
  type State,
} from './logic'

/**
 * 目標そのもの（達成の記録・アバター）の管理と、その永続化を担当する。
 * 画面遷移・タイマーは持たず、達成の記録は `markSessionDone` として外から呼ばれる。
 *
 * **記録から計算できるものは保存しない**（README 2章）。DB に置くのは
 * 「何日つけたか」と「進化の演出をどこまで見せたか」だけで、連続サイクル数も
 * 気分もステージも画面を描くたびにその場で計算する。丸ごと UPSERT はやめて、
 * 変わったものだけを INSERT / UPDATE する。
 *
 * 持ち主が誰かは知らない。`userId`（`auth.users.id` の uuid）を1つ受け取るだけで、
 * ログインの面倒は useAuth が見る（AUTH_PLAN 4章）。
 * RLS が同じ条件で絞るので、`.eq('user_id', ...)` はもう防御ではなく絞り込み。
 *
 * **消す操作はここに置かない。** 本番の画面からは記録も目標も消えない（行は増える
 * だけ）。消せるのはデバッグ画面だけで、実体は `state/debug.ts` にある。
 */

/** 1セッションの長さ。`records.minutes` に入れる */
const SESSION_MINUTES = 5

/** join の結果。1目標に1体だが、返りが配列になることがある */
const oneOf = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null

/**
 * 「いま開いている目標」の置き場所。**本体は下の `currentId`（useState）で、
 * ここはリロードしたときの初期値を1つ拾うためだけにある。**
 * 無いと F5 のたびに最新の目標へ飛ばされるが、それで構わないなら
 * `readCurrentId` / `writeCurrentId` の中身を消せば useState だけに戻る。
 *
 * DB に「現役フラグ」を置かないのは schema.sql に書いた理由と同じ。
 * 端末をまたいで揃わないのは承知のうえで、列を増やさない方を採った。
 */
const CURRENT_KEY = (userId: string) => `kma.currentGoal.${userId}`

const readCurrentId = (userId: string): number | null => {
  try {
    const raw = localStorage.getItem(CURRENT_KEY(userId))
    const n = raw === null ? NaN : Number(raw)
    return Number.isSafeInteger(n) ? n : null
  } catch {
    // プライベートウィンドウなどで localStorage が読めないことがある
    return null
  }
}

const writeCurrentId = (userId: string, id: number) => {
  try {
    localStorage.setItem(CURRENT_KEY(userId), String(id))
  } catch {
    // 保存できなくても動きは変わらない（次に開いたとき最新の目標になるだけ）
  }
}

/**
 * 読み込みの結果。**「読めて、目標が無かった」と「読めなかった」を混ぜない。**
 * 前者は初期状態へ戻す（デバッグ画面で目標を消した直後がこれ）が、
 * 後者で戻すと、通信が切れただけで画面から目標が消えてしまう。
 */
type Loaded = { ok: true; goals: State[] } | { ok: false }

/**
 * その人の目標を**全部**読む。新しい順（`id` の降順）。
 *
 * **目標は同時に何本あってもいい。** `goals` は最初から user ごとに何行でも持てて、
 * `avatars` は `goal_id` に 1:1、`records` も `goal_id` に紐づいているので、
 * 1本に絞っていたのは「最新1件だけ読む」というこの関数の都合でしかなかった。
 * どれを開くかは `currentId` が決める。
 *
 * 記録は目標ごとに引かず `in` で1回にまとめる。目標が増えても往復は2回のまま。
 */
async function fetchGoals(userId: string, isCurrent: () => boolean): Promise<Loaded> {
  const { data, error } = await supabase
    .from('goals')
    .select('id, goal, deadline, cycle_days, started_at, avatars(name, hue, seen_stage)')
    .eq('user_id', userId)
    .order('id', { ascending: false })

  if (!isCurrent()) return { ok: false }
  if (error) throw error

  const rows = data ?? []
  if (rows.length === 0) return { ok: true, goals: [] }

  const { data: records, error: recordsError } = await supabase
    .from('records')
    .select('goal_id, done_on')
    .in('goal_id', rows.map((g) => g.id))
    .order('done_on')

  if (recordsError) throw recordsError

  const doneOf = new Map<number, string[]>()
  for (const r of records ?? []) {
    const goalId = r.goal_id as number
    const list = doneOf.get(goalId)
    if (list) list.push(r.done_on as string)
    else doneOf.set(goalId, [r.done_on as string])
  }

  return {
    ok: true,
    goals: rows.map((row) => {
      const avatar = oneOf(row.avatars as { name: string; hue: number; seen_stage: number }[])
      return {
        ...initialState(),
        goalId: row.id,
        goal: row.goal ?? '',
        deadline: row.deadline ?? null,
        cycleDays: row.cycle_days ?? 1,
        startedAt: row.started_at ?? null,
        hue: avatar?.hue ?? 150,
        name: avatar?.name ?? '',
        seenStage: avatar?.seen_stage ?? 0,
        done: doneOf.get(row.id) ?? [],
      }
    }),
  }
}

export function useGoalState(userId: string | null) {
  /** 読み込んだ目標たち。新しい順。**`dayOffset` は入っていない**（返す時に混ぜる） */
  const [goals, setGoals] = useState<State[]>([])
  /** いま開いている目標。null は「どれも開いていない（目標設定画面）」 */
  const [currentId, setCurrentId] = useState<number | null>(null)
  /**
   * 目標設定画面のための下書き。前のアバターの色・名前を引き継ぐためだけにある。
   * 目標を開いている間（`currentId !== null`）は使われない。
   */
  const [draft, setDraft] = useState<State | null>(null)
  /** お試し用の日送り。DB に無い画面の都合なので、目標を切り替えても持ち越す */
  const [dayOffset, setOffset] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)
  const [hasGoalHistory, setHasGoalHistory] = useState(false)
  const [stateUserId, setStateUserId] = useState(userId)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const mutation = useRef<object | null>(null)
  const creation = useRef<{ userId: string; input: string; requestId: string } | null>(null)
  const recordSaves = useRef(new Map<string, Promise<boolean>>())
  const currentUserId = useRef(userId)
  currentUserId.current = userId

  // アカウント変更の描画から、前のアカウントのデータを公開しない。
  const belongsToUser = stateUserId === userId
  const loaded = userId !== null && belongsToUser && loadedUserId === userId

  const current = goals.find((g) => g.goalId === currentId) ?? null
  const state: State = { ...(current ?? draft ?? initialState()), dayOffset }
  const currentState = belongsToUser ? state : initialState()
  const requestVersion = useRef(0)

  // タイマーからの達成は、最後に描いた state ではなく「今の state」で書きたい
  const latest = useRef(currentState)
  latest.current = currentState

  /** 目標1本だけを差し替える。記録も演出の進みも期限もここを通す */
  const patch = useCallback((id: number, fn: (g: State) => State) => {
    setGoals((gs) => gs.map((g) => (g.goalId === id ? fn(g) : g)))
  }, [])

  /**
   * 読み込んだ結果から「どれを開くか」を決める。
   * 前に開いていた目標が残っていればそれ、無ければいちばん新しいもの。
   */
  const pick = useCallback((list: State[], uid: string): number | null => {
    if (list.length === 0) return null
    const saved = readCurrentId(uid)
    if (saved !== null && list.some((g) => g.goalId === saved)) return saved
    return list[0].goalId
  }, [])

  useEffect(() => {
    setStateUserId(userId)
    setGoals([])
    setCurrentId(null)
    setDraft(null)
    setOffset(0)
    setHasStarted(false)
    setHasGoalHistory(false)
    setLoadedUserId(null)
    setLoadError(null)
    mutation.current = null
    creation.current = null
    setSaving(false)
    setSaveError(null)
  }, [userId])

  /**
   * DB から読み直す。デバッグ画面が「消したあと、本当に消えたか」を
   * 画面で確かめるために使う。**日送り（`dayOffset`）は DB に無い画面の都合
   * なので引き継ぐ。** 読み直すたびに今日へ戻ると、日付を動かしながらの
   * 確認ができない。
   */
  const reload = useCallback(async () => {
    if (!userId) return
    const version = ++requestVersion.current
    setLoadError(null)
    try {
      const result = await fetchGoals(userId, () =>
        currentUserId.current === userId && version === requestVersion.current
      )
      if (currentUserId.current !== userId || version !== requestVersion.current) return
      if (!result.ok) throw new Error('目標を読み込めませんでした')
      setGoals(result.goals)
      setDraft(null)
      setCurrentId((id) =>
        result.goals.some((g) => g.goalId === id) ? id : pick(result.goals, userId)
      )
      setHasStarted(result.goals.length > 0)
      if (result.goals.length > 0) setHasGoalHistory(true)
      setLoadedUserId(userId)
    } catch (error) {
      if (currentUserId.current !== userId || version !== requestVersion.current) return
      console.error('目標・記録の読み込みエラー:', error)
      setLoadedUserId(null)
      setLoadError('目標の読み込みに失敗しました。時間をおいて再試行してください。')
    }
  }, [userId, pick])

  useEffect(() => {
    void reload()
    return () => { requestVersion.current += 1 }
  }, [reload, loadAttempt])

  const retryLoad = useCallback(() => {
    setLoadedUserId(null)
    setLoadError(null)
    setLoadAttempt((attempt) => attempt + 1)
  }, [])

  /** 目標を切り替える。**DB には触らない**（どれを開いているかは画面の都合） */
  const selectGoal = useCallback(
    (id: number) => {
      if (!userId) return
      if (!goals.some((g) => g.goalId === id)) return
      setCurrentId(id)
      setDraft(null)
      setHasStarted(true)
      writeCurrentId(userId, id)
    },
    [userId, goals]
  )

  /**
   * 目標とアバターをDB内の1トランザクションで作る。同じ入力の再送は同じ目標を返す。
   *
   * **前の目標には何もしません。** 行を足すだけで、記録もアバターもそのまま残り、
   * 目標一覧から行き来できます。作った直後はその新しい目標が開きます。
   */
  const start = async (input: SetupInput) => {
    if (!userId || mutation.current) return false
    const operation = {}
    mutation.current = operation
    setSaving(true)
    setSaveError(null)
    try {
      const serialized = JSON.stringify(input)
      if (creation.current?.userId !== userId || creation.current.input !== serialized) {
        creation.current = { userId, input: serialized, requestId: crypto.randomUUID() }
      }
      const { data, error } = await supabase.rpc('create_goal_with_avatar', {
        p_request_id: creation.current.requestId,
        p_goal: input.goal, p_deadline: input.deadline, p_cycle_days: input.cycleDays,
        p_name: input.name, p_hue: input.hue,
      })
      if (error || !data) throw error ?? new Error('No created goal')
      if (currentUserId.current !== userId) return false
      const created: State = {
        ...initialState(),
        goalId: data.id,
        goal: input.goal,
        deadline: input.deadline,
        cycleDays: input.cycleDays,
        startedAt: data.started_at,
        hue: input.hue,
        name: input.name,
        seenStage: 0,
        done: [],
      }

      setGoals((gs) => [created, ...gs.filter((g) => g.goalId !== data.id)])
      setCurrentId(data.id)
      setDraft(null)
      setHasStarted(true)
      setHasGoalHistory(true)
      writeCurrentId(userId, data.id)
      return true
    } catch (error) {
      console.error('目標作成エラー:', error)
      if (currentUserId.current === userId) setSaveError('目標を保存できませんでした。接続を確認して、もう一度保存してください。')
      return false
    } finally {
      if (mutation.current === operation) {
        mutation.current = null
        setSaving(false)
      }
    }
  }

  /** 表示だけ初期状態へ戻す。**DB には触らない**（目標も記録も残る） */
  const reset = () => {
    setHasStarted(false)
    setCurrentId(null)
    setDraft(null)
  }

  /** 今日を達成にする。`records` に1行 INSERT するだけ（同日は UNIQUE が弾く） */
  const markSessionDone = (day?: string): Promise<boolean> => {
    const s = latest.current
    // タイマー経由ではDBが判定した日付を使い、端末の時計がずれても日付を揃える。
    const doneOn = day ?? key(today(s))
    if (s.done.includes(doneOn)) return Promise.resolve(true)
    if (!userId || s.goalId === null) return Promise.resolve(false)
    const id = s.goalId
    const scope = `${userId}:${id}:${doneOn}`
    const pending = recordSaves.current.get(scope)
    if (pending) return pending
    const save = async () => {
      try {
        const { error } = await supabase.from('records')
          .insert({ goal_id: id, done_on: doneOn, minutes: SESSION_MINUTES })
        // 応答が失われた後の再試行など、既存の同日記録は成功として扱う。
        if (error && error.code !== '23505') throw error
        if (currentUserId.current !== userId) return false
        patch(id, (g) => g.done.includes(doneOn) ? g : { ...g, done: [...g.done, doneOn] })
        return true
      } catch (error) {
        console.error('記録の保存エラー:', error)
        return false
      } finally {
        recordSaves.current.delete(scope)
      }
    }
    const promise = Promise.resolve().then(save)
    recordSaves.current.set(scope, promise)
    return promise
  }

  /** 進化の演出を流し終わった（README 2章） */
  const markStageSeen = async (stage: number) => {
    const s = latest.current
    if (stage <= s.seenStage) return
    if (s.goalId === null) return

    patch(s.goalId, (g) => ({ ...g, seenStage: stage }))

    const { error } = await supabase
      .from('avatars')
      .update({ seen_stage: stage })
      .eq('goal_id', s.goalId)

    if (error) console.error('演出の記録に失敗:', error)
  }

  /**
   * お試し用。アプリの中の日付だけをずらす（DB には触らない）。
   * **負の値も入る。** 過去へ戻せないと、行き過ぎた日送りをやり直せない。
   */
  const setDayOffset = (days: number) => setOffset(days)

  /** お試し用。1日進める */
  const nextDay = () => setOffset((d) => d + 1)

  const extendDeadline = async () => {
    const s = latest.current
    if (!s.deadline || s.goalId === null) return

    const newDeadline = key(addMonths(parseKey(s.deadline), 1))

    const { error } = await supabase
      .from('goals')
      .update({ deadline: newDeadline })
      .eq('id', s.goalId)

    if (error) {
      console.error('期限更新エラー:', error)
      return
    }

    patch(s.goalId, (g) => ({ ...g, deadline: newDeadline }))
  }

  /**
   * 開いている目標とアバターを1トランザクションで直す。
   * **ペース（`cycle_days`）は変えない。** 変えると過去の記録の数え方まで変わってしまう（README 2章）。
   * 記録も進化の演出の進みもそのまま。
   */
  const updateGoal = async (input: GoalEdit) => {
    const s = latest.current
    if (!userId || s.goalId === null || mutation.current) return false
    const id = s.goalId
    const operation = {}
    mutation.current = operation
    setSaving(true)
    setSaveError(null)
    try {
      const { error } = await supabase.rpc('update_goal_with_avatar', {
        p_goal_id: id, p_goal: input.goal, p_deadline: input.deadline,
        p_name: input.name, p_hue: input.hue,
      })
      if (error) throw error
      if (currentUserId.current !== userId) return false
      patch(id, (g) => ({ ...g, ...input }))
      return true
    } catch (error) {
      console.error('目標更新エラー:', error)
      if (currentUserId.current === userId) setSaveError('変更を保存できませんでした。接続を確認して、もう一度保存してください。')
      return false
    } finally {
      if (mutation.current === operation) {
        mutation.current = null
        setSaving(false)
      }
    }
  }

  /**
   * 目標設定画面へ戻る。**前の目標は消えない。** 開いているものを外すだけなので、
   * 作るのをやめて目標一覧から前の目標へ戻れる。
   */
  const newGoal = () => {
    creation.current = null
    setSaveError(null)
    setDraft(resetGoal(latest.current))
    setCurrentId(null)
    setHasStarted(false)
  }

  return {
    state: currentState,
    /** 目標一覧用。新しい順、`dayOffset` を混ぜた形で返す */
    goals: belongsToUser ? goals.map((g) => ({ ...g, dayOffset })) : [],
    currentGoalId: belongsToUser ? currentId : null,
    loaded,
    loadError: belongsToUser ? loadError : null,
    retryLoad,
    saving: belongsToUser && saving,
    saveError: belongsToUser ? saveError : null,
    hasStarted: belongsToUser && hasStarted,
    hasGoalHistory: belongsToUser && hasGoalHistory,
    start,
    selectGoal,
    reset,
    reload,
    markSessionDone,
    markStageSeen,
    setDayOffset,
    nextDay,
    extendDeadline,
    updateGoal,
    newGoal,
  }
}
