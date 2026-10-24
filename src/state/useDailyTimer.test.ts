// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { calendarDate } from './calendarDate'
import { useDailyTimer } from './useDailyTimer'
import type { TimerReply, TimerStatus } from './timerStorage'

const storage = vi.hoisted(() => ({ readTimer: vi.fn(), setTimerRunning: vi.fn() }))
vi.mock('./timerStorage', () => storage)

let root: Root
let container: HTMLDivElement
let timer: ReturnType<typeof useDailyTimer>
const complete = vi.fn()

const reply = (patch: Partial<TimerStatus> = {}, conflict = false): TimerReply => ({
  state: {
    goal_id: 1, timer_on: calendarDate(), accumulated_ms: 0,
    running_since: null, version: 0, updated_at: null, ...patch,
  },
  server_now: new Date().toISOString(), conflict,
})

type Props = { userId?: string | null; goalId?: number; local?: boolean; days?: string[]; offset?: number }
function Harness({ userId = 'user-a', goalId = 1, local = false, days = [], offset = 0 }: Props) {
  timer = useDailyTimer(complete, 300, { userId, goalId, recordedDays: days, local, dayOffset: offset })
  return null
}
async function render(props: Props = {}) {
  await act(async () => root.render(createElement(Harness, props)))
}
async function tick(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms))
}
function deferred() {
  let resolve!: (reply: TimerReply) => void
  const promise = new Promise<TimerReply>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T01:00:00Z'))
  storage.readTimer.mockReset().mockImplementation(async (goalId: number) => reply({ goal_id: goalId }))
  storage.setTimerRunning.mockReset()
  complete.mockReset()
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('restores a paused timer without counting time spent away', async () => {
  storage.readTimer.mockResolvedValue(reply({ accumulated_ms: 120600, version: 2 }))
  await render()
  expect(timer.ready).toBe(true)
  expect(timer.elapsed).toBe(120)
  expect(timer.running).toBe(false)
  await tick(10000)
  expect(timer.elapsed).toBe(120)
  expect(storage.setTimerRunning).not.toHaveBeenCalled()
})

it('keeps recording available after a failed achievement save', async () => {
  storage.readTimer.mockResolvedValue(reply({ accumulated_ms: 300000 }))
  let resolve!: (success: boolean) => void
  complete.mockReturnValueOnce(new Promise<boolean>((done) => { resolve = done })).mockResolvedValueOnce(true)
  await render()
  let operation!: ReturnType<typeof timer.finish>
  await act(async () => { operation = timer.finish() })
  expect(timer.busy).toBe(true)
  await act(async () => { void timer.finish() })
  expect(complete).toHaveBeenCalledOnce()
  await act(async () => { resolve(false); await operation })
  expect(timer.busy).toBe(false)
  expect(timer.error).toContain('記録を保存できませんでした')
  expect(timer.reached).toBe(true)
  await act(async () => timer.finish())
  expect(complete).toHaveBeenCalledTimes(2)
  expect(timer.error).toBeNull()
})

it('restores a running timer across a browser refresh including time spent closed', async () => {
  const running = reply({ accumulated_ms: 120000, running_since: new Date().toISOString(), version: 3 })
  storage.readTimer.mockImplementation(async () => ({ ...running, server_now: new Date().toISOString() }))
  await render()
  await tick(3000)
  expect(timer.elapsed).toBe(123)
  await act(async () => root.unmount())
  vi.setSystemTime(Date.now() + 60000)
  root = createRoot(container)
  await render()
  expect(timer.running).toBe(true)
  expect(timer.elapsed).toBe(183)
  expect(complete).not.toHaveBeenCalled()
})

it('saves on start and pause, retaining fractional seconds and the expected version', async () => {
  await render()
  storage.setTimerRunning.mockResolvedValueOnce(reply({ running_since: new Date().toISOString(), version: 1 }))
  await act(async () => { await timer.toggle() })
  const original = storage.setTimerRunning.mock.calls[0][0]
  expect(original.version).toBe(0)
  expect(storage.setTimerRunning.mock.calls[0][1]).toBe(true)
  await tick(1600)
  storage.setTimerRunning.mockResolvedValueOnce(reply({ accumulated_ms: 1600, version: 2 }))
  await act(async () => { await timer.pause() })
  expect(storage.setTimerRunning.mock.calls[1][0].version).toBe(1)
  expect(storage.setTimerRunning.mock.calls[1][1]).toBe(false)
  expect(timer.running).toBe(false)
  await tick(10000)
  expect(timer.elapsed).toBe(1)
  expect(storage.setTimerRunning).toHaveBeenCalledTimes(2)
})

it('serializes rapid clicks and waits for the DB to confirm a change', async () => {
  await render()
  const save = deferred()
  storage.setTimerRunning.mockReturnValue(save.promise)
  await act(async () => { void timer.toggle(); void timer.toggle() })
  expect(storage.setTimerRunning).toHaveBeenCalledTimes(1)
  expect(timer.busy).toBe(true)
  expect(timer.running).toBe(false)
  await act(async () => save.resolve(reply({ running_since: new Date().toISOString(), version: 1 })))
  expect(timer.busy).toBe(false)
  expect(timer.running).toBe(true)
})

it('adopts a conflicting update instead of overwriting another device', async () => {
  await render()
  storage.setTimerRunning.mockResolvedValue(reply({ accumulated_ms: 9500, version: 4 }, true))
  let paused: boolean | undefined
  await act(async () => { paused = await timer.toggle() as boolean })
  expect(paused).toBe(false)
  expect(timer.elapsed).toBe(9)
  expect(timer.error).toContain('別の端末')
  expect(timer.ready).toBe(true)
  expect(storage.setTimerRunning).toHaveBeenCalledTimes(1)
})

it('keeps the saved time on an uncertain write and reads it before allowing another write', async () => {
  storage.readTimer.mockResolvedValueOnce(reply({ accumulated_ms: 120000, version: 2 }))
  await render()
  storage.setTimerRunning.mockRejectedValueOnce(new Error('response lost'))
  await act(async () => { await timer.toggle() })
  expect(timer.elapsed).toBe(120)
  expect(timer.ready).toBe(false)
  expect(timer.error).toContain('保存結果')
  await act(async () => { await timer.toggle() })
  expect(storage.setTimerRunning).toHaveBeenCalledTimes(1)
  storage.readTimer.mockResolvedValueOnce(reply({ accumulated_ms: 120000, running_since: new Date().toISOString(), version: 3 }))
  await act(async () => { await timer.retry() })
  expect(timer.ready).toBe(true)
  expect(timer.running).toBe(true)
  expect(timer.error).toBeNull()
})

it('does not display a zero timer as successfully restored when loading fails', async () => {
  storage.readTimer.mockRejectedValueOnce(new Error('offline'))
  await render()
  expect(timer.ready).toBe(false)
  expect(timer.error).toContain('読み込めませんでした')
  await act(async () => { await timer.toggle() })
  expect(storage.setTimerRunning).not.toHaveBeenCalled()
  storage.readTimer.mockResolvedValueOnce(reply({ accumulated_ms: 90000 }))
  await act(async () => { await timer.retry() })
  expect(timer.elapsed).toBe(90)
  expect(timer.ready).toBe(true)
})

it('refreshes another device pause on focus and never double counts return events', async () => {
  storage.readTimer.mockResolvedValueOnce(reply({ running_since: new Date().toISOString(), version: 1 }))
  await render()
  vi.setSystemTime(Date.now() + 90000)
  storage.readTimer.mockResolvedValue(reply({ accumulated_ms: 45000, version: 2 }))
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('pageshow'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(timer.elapsed).toBe(45)
  expect(timer.running).toBe(false)
  await tick(5000)
  expect(timer.elapsed).toBe(45)
})

it('ignores a late load from the previous account or goal', async () => {
  const old = deferred()
  storage.readTimer.mockReturnValueOnce(old.promise)
  await render()
  await render({ userId: 'user-b', goalId: 2 })
  expect(timer.ready).toBe(true)
  expect(timer.elapsed).toBe(0)
  await act(async () => old.resolve(reply({ accumulated_ms: 90000, version: 3 })))
  expect(timer.elapsed).toBe(0)
  expect(timer.running).toBe(false)
})

it('ignores a late save after the account changes', async () => {
  await render()
  const old = deferred()
  storage.setTimerRunning.mockReturnValueOnce(old.promise)
  await act(async () => { void timer.toggle() })
  await render({ userId: 'user-b', goalId: 2 })
  await act(async () => old.resolve(reply({ running_since: new Date().toISOString(), version: 1 })))
  expect(timer.elapsed).toBe(0)
  expect(timer.running).toBe(false)
  expect(timer.ready).toBe(true)
  expect(timer.busy).toBe(false)
})

it('resets to a stopped timer at midnight in Japan and does not record automatically', async () => {
  vi.setSystemTime(new Date('2026-10-23T14:59:58Z'))
  storage.readTimer.mockResolvedValueOnce(reply({ accumulated_ms: 120000, running_since: new Date().toISOString(), version: 1 }))
  await render()
  await tick(3000)
  expect(timer.elapsed).toBe(0)
  expect(timer.running).toBe(false)
  expect(timer.ready).toBe(true)
  expect(complete).not.toHaveBeenCalled()
})

it('does not repeatedly request an expired day every second while offline', async () => {
  vi.setSystemTime(new Date('2026-10-23T14:59:58Z'))
  storage.readTimer.mockResolvedValueOnce(reply({ accumulated_ms: 120000 }))
  await render()
  storage.readTimer.mockRejectedValue(new Error('offline'))
  await tick(12000)
  expect(storage.readTimer).toHaveBeenCalledTimes(2)
  expect(timer.ready).toBe(false)
})

it('rechecks the server before recording and rejects a finish crossing midnight', async () => {
  vi.setSystemTime(new Date('2026-10-23T14:59:59Z'))
  storage.readTimer.mockResolvedValueOnce(reply({ accumulated_ms: 305000, version: 2 }))
  await render()
  vi.setSystemTime(Date.now() + 2000)
  await act(async () => { await timer.finish() })
  expect(complete).not.toHaveBeenCalled()
  expect(timer.elapsed).toBe(0)
})

it('records at five minutes and keeps the saved timer running after recording', async () => {
  storage.readTimer.mockImplementation(async () => reply({
    accumulated_ms: 300000, running_since: new Date().toISOString(), version: 3,
  }))
  await render()
  await act(async () => { await timer.finish() })
  expect(complete).toHaveBeenCalledTimes(1)
  expect(complete).toHaveBeenCalledWith(calendarDate())
  expect(timer.running).toBe(true)
  // 完了した日はアカウントの記録から復元し、再読み込み後の二重記録も防ぐ。
  await render({ days: [calendarDate()] })
  await act(async () => { await timer.finish() })
  expect(complete).toHaveBeenCalledTimes(1)
})

it('compensates for a device clock that differs from the server', async () => {
  const server = Date.now() + 3600000
  storage.readTimer.mockResolvedValue({
    ...reply({ running_since: new Date(server - 120000).toISOString(), version: 1 }),
    server_now: new Date(server).toISOString(),
  })
  await render()
  expect(timer.elapsed).toBe(120)
  await tick(1000)
  expect(timer.elapsed).toBe(121)
})

it('keeps debug time and simulated days out of the saved timer', async () => {
  await render({ local: true })
  await act(async () => { await timer.toggle() })
  await tick(6000)
  expect(timer.elapsed).toBe(6)
  await render({ local: true, offset: 1 })
  expect(timer.elapsed).toBe(0)
  expect(timer.running).toBe(false)
  expect(storage.readTimer).not.toHaveBeenCalled()
  expect(storage.setTimerRunning).not.toHaveBeenCalled()
})
