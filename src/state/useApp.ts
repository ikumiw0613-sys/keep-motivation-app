import { SESSION, type GoalEdit, type SetupInput } from './logic'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { useGoalState } from './useGoalState'
import { isDebugPath, useScreen, type Screen } from './useScreen'
import { useDailyTimer } from './useDailyTimer'
import { allowedScreen, entryScreen } from './screenFlow'

export type { Screen }

/**
 * デバッグ画面でのタイマーの長さ（秒）。5分待たずに「終わったあと」を確かめる用。
 * **変わるのは長さだけ。** タイマーも記録の保存も本番と同じもの（useTimer / markSessionDone）を通す
 */
const DEBUG_SESSION = 5

/**
 * ログイン状態（useAuth）・画面遷移（useScreen）・タイマー（useDailyTimer）・
 * 目標の状態と保存（useGoalState）を1つのAPIにまとめる合成層。
 * 4つの間をまたぐ操作（達成でタイマーを止める、ログアウトで全部戻す、など）はここで配線する。
 */
export function useApp() {
  const { screen: requestedScreen, setScreen } = useScreen()
  const auth = useAuth()
  const userId = auth.user?.id ?? null
  // useGoalState が知るのは uuid 1つだけ。誰かはここで渡す
  const goal = useGoalState(userId)
  const [routedUserId, setRoutedUserId] = useState<string | null>(null)
  /**
   * 「新しい目標を作る」を押す前に開いていた目標。作成画面の「戻る」でここへ帰る。
   * 初めての目標づくりには戻り先が無いので null のまま（戻るボタンも出さない）
   */
  const [returnGoalId, setReturnGoalId] = useState<number | null>(null)
  const currentUserId = useRef(userId)
  currentUserId.current = userId
  // 以前に目標を設定したアカウントも、初回の案内は完了済みとして扱う。
  const tutorialCompleted = auth.tutorialCompleted || goal.hasGoalHistory
  const hasCurrentGoal = goal.hasStarted && goal.state.goalId !== null
  const screen = allowedScreen(requestedScreen, tutorialCompleted, hasCurrentGoal)
  // デバッグ画面は開発時しか読み込まれない（app/App.tsx）が、長さの切り替えも DEV で閉じておく
  const debug = import.meta.env.DEV && screen === 'debug'
  const session = debug ? DEBUG_SESSION : SESSION
  const timer = useDailyTimer(goal.markSessionDone, session, {
    userId,
    goalId: goal.loaded ? goal.state.goalId : null,
    recordedDays: goal.state.done,
    local: debug,
    dayOffset: goal.state.dayOffset,
  })
  const navigating = useRef(false)

  /** 保存できなかった場合は元の目標に留まり、再試行できるようにする。 */
  const afterPause = async (action: () => void | Promise<void>) => {
    if (navigating.current) return
    navigating.current = true
    try {
      if (await timer.pause() && currentUserId.current === userId) await action()
    } finally {
      navigating.current = false
    }
  }

  useEffect(() => {
    if (!userId || !goal.loaded) {
      setRoutedUserId(null)
      return
    }
    if (routedUserId === userId) return
    setScreen(isDebugPath() ? 'debug' : entryScreen(tutorialCompleted, hasCurrentGoal))
    setRoutedUserId(userId)
  }, [userId, goal.loaded, tutorialCompleted, hasCurrentGoal, routedUserId, setScreen])

  const go = (id: Screen) => {
    setScreen(allowedScreen(id, tutorialCompleted, hasCurrentGoal))
  }

  const completeTutorial = async () => {
    if (!userId) return
    if (await auth.completeTutorial() && currentUserId.current === userId) {
      setScreen('setup')
    }
  }

  const start = async (input: SetupInput) => {
    if (await goal.start(input) && currentUserId.current === userId) {
      setReturnGoalId(null)
      setScreen('main')
      return true
    }
    return false
  }

  const reset = () => afterPause(() => {
    goal.reset()
    setScreen('setup')
  })

  /**
   * 別の目標へ移る前に、元の目標の計測を停止してDBに確定する。
   */
  const selectGoal = (id: number) => afterPause(() => {
    goal.selectGoal(id)
    setScreen('main')
  })

  const recordOnly = async () => {
    if (await goal.markSessionDone()) timer.complete()
  }

  const nextDay = () => {
    timer.reset()
    goal.nextDay()
  }

  /** デバッグ画面の日付操作。日をまたぐのでタイマーは捨てる */
  const setDayOffset = (days: number) => {
    timer.reset()
    goal.setDayOffset(days)
  }

  const newGoal = () => afterPause(() => {
    setReturnGoalId(goal.currentGoalId)
    goal.newGoal()
    setScreen('setup')
  })

  /** 作成画面の「戻る」。**まだ何も作っていない**ので、前に開いていた目標を開き直すだけ */
  const cancelNewGoal = async () => {
    if (returnGoalId === null) return
    await selectGoal(returnGoalId)
    setReturnGoalId(null)
  }

  /** 目標の修正画面を開く。**タイマーは止めない**（開いている目標は変わらない） */
  const editGoal = () => {
    if (!hasCurrentGoal) return
    setScreen('edit')
  }

  const saveGoal = async (input: GoalEdit) => {
    if (await goal.updateGoal(input) && currentUserId.current === userId) {
      setScreen('main')
      return true
    }
    return false
  }

  /** 修正をやめる。何も書いていないので、ダッシュボードへ戻るだけ */
  const cancelEdit = () => setScreen('main')

  /** ログアウト。目標の状態は user が null になった useGoalState 側で戻る */
  const signOut = async () => {
    // 停止は試みるが、通信障害があってもアカウントから退出できるようにする。
    await timer.pause()
    if (currentUserId.current !== userId) return
    timer.reset()
    setReturnGoalId(null)
    setScreen('top')
    await auth.signOut()
  }

  return {
    user: auth.user,
    ready: auth.ready,
    authError: auth.authError,
    signIn: auth.signIn,
    signUp: auth.signUp,
    signInWithGoogle: auth.signInWithGoogle,
    recovering: auth.recovering,
    requestPasswordReset: auth.requestPasswordReset,
    resendConfirmation: auth.resendConfirmation,
    updatePassword: auth.updatePassword,
    signOut,
    state: goal.state,
    goals: goal.goals,
    currentGoalId: goal.currentGoalId,
    loaded: goal.loaded && routedUserId === userId,
    loadError: goal.loadError,
    retryLoad: goal.retryLoad,
    savingGoal: goal.saving,
    goalSaveError: goal.saveError,
    hasStarted: goal.hasStarted,
    hasCurrentGoal,
    tutorialCompleted,
    completeTutorial,
    screen,
    go,
    start,
    selectGoal,
    reset,
    extendDeadline: goal.extendDeadline,
    markStageSeen: goal.markStageSeen,
    newGoal,
    editGoal,
    saveGoal,
    cancelEdit,
    cancelNewGoal: returnGoalId !== null ? cancelNewGoal : null,
    session,
    elapsed: timer.elapsed,
    running: timer.running,
    reached: timer.reached,
    timerReady: timer.ready,
    timerBusy: timer.busy,
    timerError: timer.error,
    retryTimer: timer.retry,
    toggleTimer: timer.toggle,
    finishTimer: timer.finish,
    recordOnly,
    nextDay,
    setDayOffset,
    reload: goal.reload,
  }
}
