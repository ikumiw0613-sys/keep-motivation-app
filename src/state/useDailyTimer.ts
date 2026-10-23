import { useCallback, useEffect, useRef, useState } from 'react'
import { calendarDate, calendarDayEnd } from './calendarDate'
import { readTimer, setTimerRunning, type TimerReply, type TimerStatus } from './timerStorage'
import { useTimer } from './useTimer'

type Options = {
  userId: string | null
  goalId: number | null
  recordedDays: string[]
  /** デバッグでの日送りは、本番のタイマーに保存しない。 */
  local: boolean
  dayOffset: number
}

const CONFLICT = '別の端末でタイマーが変更されました。最新の状態を表示しました。もう一度操作してください。'

/** DBを正本にし、画面の時計だけをuseTimerで進める。保存成功後に状態を切り替える。 */
export function useDailyTimer(onComplete: (day?: string) => void, seconds: number, options: Options) {
  const { userId, goalId, local, dayOffset } = options
  const state = useRef<TimerStatus | null>(null)
  const timer = useTimer(() => onComplete(local ? undefined : state.current?.timer_on), seconds)
  const scope = userId && goalId !== null ? `${userId}:${goalId}:${local ? dayOffset : 'db'}` : null
  const currentScope = useRef(scope)
  currentScope.current = scope
  const recordedDays = useRef(options.recordedDays)
  recordedDays.current = options.recordedDays
  const offset = useRef(0)
  const checkedDay = useRef(calendarDate())
  const request = useRef(0)
  const loading = useRef(false)
  const changing = useRef(false)
  const mounted = useRef(false)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const apply = useCallback((reply: TimerReply, started: number) => {
    // 通信の往復の中央でサーバー時刻を受けたと見積もり、端末の時計のずれを補正する。
    offset.current = Date.parse(reply.server_now) - (started + Date.now()) / 2
    state.current = reply.state
    const row = reply.state
    checkedDay.current = row.timer_on
    timer.restore({
      accumulatedMs: row.accumulated_ms,
      startedAt: row.running_since === null ? null : Date.parse(row.running_since) - offset.current,
      endsAt: calendarDayEnd(row.timer_on) - offset.current,
    }, recordedDays.current.includes(row.timer_on))
    setLoadedScope(currentScope.current)
    setReady(true)
  }, [timer.restore])

  const refresh = useCallback(async () => {
    if (local || scope === null || goalId === null || loading.current || changing.current) return false
    const id = ++request.current
    loading.current = true
    const started = Date.now()
    try {
      const reply = await readTimer(goalId)
      if (!mounted.current || currentScope.current !== scope || request.current !== id) return false
      apply(reply, started)
      setError(null)
      return true
    } catch {
      if (mounted.current && currentScope.current === scope && request.current === id) {
        setReady(false)
        setError('タイマーを読み込めませんでした。接続を確認して再試行してください。')
      }
      return false
    } finally {
      if (request.current === id) loading.current = false
    }
  }, [scope, goalId, local, apply])

  useEffect(() => {
    ++request.current
    loading.current = false
    changing.current = false
    state.current = null
    offset.current = 0
    setLoadedScope(null)
    setReady(false)
    setBusy(false)
    setError(null)
    timer.reset()
    if (!local && scope !== null) void refresh()
    return () => { ++request.current }
  }, [scope, local, refresh, timer.reset])

  useEffect(() => {
    if (local || scope === null) return
    const onReturn = () => {
      if (document.visibilityState !== 'hidden') void refresh()
    }
    const checkDate = () => {
      const day = calendarDate(Date.now() + offset.current)
      if (state.current && checkedDay.current !== day) {
        checkedDay.current = day
        // 再取得の間も、前日の時間で今日の記録を付けられないようにする。
        setReady(false)
        void refresh()
      }
    }
    const dayInterval = window.setInterval(checkDate, 1000)
    const refreshInterval = window.setInterval(onReturn, 30000)
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    window.addEventListener('pageshow', onReturn)
    window.addEventListener('online', onReturn)
    return () => {
      clearInterval(dayInterval)
      clearInterval(refreshInterval)
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
      window.removeEventListener('pageshow', onReturn)
      window.removeEventListener('online', onReturn)
    }
  }, [scope, local, refresh])

  const change = async (running: boolean) => {
    if (!ready || loadedScope !== scope || !state.current || changing.current || loading.current) return false
    const row = state.current
    const id = ++request.current
    const started = Date.now()
    changing.current = true
    setBusy(true)
    setError(null)
    try {
      const reply = await setTimerRunning(row, running)
      if (!mounted.current || currentScope.current !== scope || request.current !== id) return false
      apply(reply, started)
      setError(reply.conflict ? CONFLICT : null)
      return !reply.conflict
    } catch {
      if (mounted.current && currentScope.current === scope && request.current === id) {
        // レスポンスが失われた場合、DBだけ更新済みかもしれない。再送より先に読み直す。
        setReady(false)
        setError('タイマーの保存結果を確認できませんでした。再試行して最新の状態を読み込んでください。')
      }
      return false
    } finally {
      if (mounted.current && currentScope.current === scope && request.current === id) {
        changing.current = false
        setBusy(false)
      }
    }
  }

  const pause = async () => {
    if (scope === null) return true
    if (local) {
      if (timer.running) timer.toggle()
      return true
    }
    if (!ready || loadedScope !== scope || loading.current || changing.current) return false
    return state.current?.running_since === null ? true : change(false)
  }

  const toggle = () => local ? timer.toggle() : change(state.current?.running_since === null)

  const finish = async () => {
    if (local) { timer.finish(); return }
    if (!ready || loadedScope !== scope || changing.current || loading.current) return
    const day = state.current?.timer_on
    // 別端末での一時停止も反映してから、実測時間で達成の可否を確かめる。
    if (await refresh() && currentScope.current === scope && state.current?.timer_on === day) timer.finish()
  }

  const visible = scope !== null && (local || loadedScope === scope)
  return {
    elapsed: visible ? timer.elapsed : 0,
    running: visible && timer.running,
    reached: visible && (local || ready) && timer.reached,
    ready: scope === null || local || (loadedScope === scope && ready),
    busy,
    error,
    toggle,
    finish,
    pause,
    reset: timer.reset,
    complete: timer.complete,
    retry: refresh,
  }
}
