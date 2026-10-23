import { supabase } from '../lib/supabase'

export type TimerStatus = {
  goal_id: number
  timer_on: string
  accumulated_ms: number
  running_since: string | null
  version: number
  updated_at: string | null
}

export type TimerReply = {
  state: TimerStatus
  server_now: string
  conflict: boolean
}

/** 時間の確定・更新日時・バージョンの照合は、DB内でまとめて行う。 */
async function command(args: {
  p_goal_id: number
  p_timer_on?: string
  p_expected_version?: number
  p_running?: boolean
}): Promise<TimerReply> {
  const { data, error } = await supabase.rpc('timer_status_command', args)
    .abortSignal(AbortSignal.timeout(15000))
  if (error) throw error
  if (!data?.state || !data.server_now) throw new Error('タイマーの状態を取得できませんでした。')
  return data as TimerReply
}

export const readTimer = (goalId: number) => command({ p_goal_id: goalId })

export const setTimerRunning = (state: TimerStatus, running: boolean) => command({
  p_goal_id: state.goal_id,
  p_timer_on: state.timer_on,
  p_expected_version: state.version,
  p_running: running,
})
