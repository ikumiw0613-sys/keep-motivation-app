// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useTimer } from './useTimer'

let root: Root
let container: HTMLDivElement
let timer: ReturnType<typeof useTimer>
const onComplete = vi.fn()

function Harness({ seconds }: { seconds: number }) {
  timer = useTimer(onComplete, seconds)
  return null
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  onComplete.mockReset()
  container = document.createElement('div')
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const tick = async (sec: number) => {
  for (let i = 0; i < sec; i++) await act(async () => vi.advanceTimersByTime(1000))
}

// 本番（300秒）とデバッグ（5秒）で、長さ以外の動きが同じであることを確かめる
it.each([300, 5])('keeps counting past %i seconds and records only on finish', async (seconds) => {
  await act(async () => root.render(createElement(Harness, { seconds })))
  await act(async () => timer.toggle())

  // 時間前には記録を付けられない
  await tick(seconds - 1)
  await act(async () => timer.finish())
  expect(timer.reached).toBe(false)
  expect(timer.running).toBe(true)
  expect(onComplete).not.toHaveBeenCalled()

  // 時間を過ぎても勝手には止まらず、記録も付かない
  await tick(3)
  expect(timer.reached).toBe(true)
  expect(timer.running).toBe(true)
  expect(timer.elapsed).toBe(seconds + 2)
  expect(onComplete).not.toHaveBeenCalled()

  // 記録を付けても計測は続き、記録は1回だけ
  await act(async () => timer.finish())
  expect(timer.running).toBe(true)
  expect(onComplete).toHaveBeenCalledTimes(1)
  await tick(3)
  expect(timer.elapsed).toBe(seconds + 5)

  // 記録後も一時停止・再開できる
  await act(async () => timer.toggle())
  await act(async () => timer.finish())
  await tick(3)
  expect(timer.running).toBe(false)
  expect(timer.elapsed).toBe(seconds + 5)
  expect(onComplete).toHaveBeenCalledTimes(1)
  await act(async () => timer.toggle())
  await tick(2)
  expect(timer.running).toBe(true)
  expect(timer.elapsed).toBe(seconds + 7)
  await act(async () => timer.finish())
  expect(onComplete).toHaveBeenCalledTimes(1)

  // 記録後もバックグラウンドから戻ると経過時間が追いつく。
  vi.setSystemTime(Date.now() + 30000)
  await act(async () => window.dispatchEvent(new Event('focus')))
  expect(timer.elapsed).toBe(seconds + 37)

  // 日をまたぐ等で reset されたら、また回せる
  await act(async () => timer.reset())
  await act(async () => timer.toggle())
  expect(timer.running).toBe(true)
  expect(timer.reached).toBe(false)
  await tick(seconds)
  await act(async () => timer.finish())
  expect(onComplete).toHaveBeenCalledTimes(2)
})

// コールバックを動かさず時計だけ進め、バックグラウンドでの実行停止を再現する。
it.each([300, 5])('catches up after interval callbacks are suspended for %i seconds', async (seconds) => {
  await act(async () => root.render(createElement(Harness, { seconds })))
  await act(async () => timer.toggle())

  vi.setSystemTime(Date.now() + (seconds + 1) * 1000)
  await tick(1)

  expect(timer.elapsed).toBe(seconds + 2)
  expect(timer.reached).toBe(true)
  expect(timer.running).toBe(true)
  expect(onComplete).not.toHaveBeenCalled()
})

it.each(['visibilitychange', 'focus', 'pageshow'])('updates immediately on %s after returning', async (event) => {
  await act(async () => root.render(createElement(Harness, { seconds: 300 })))
  await act(async () => timer.toggle())

  vi.setSystemTime(Date.now() + 305000)
  const target = event === 'visibilitychange' ? document : window
  await act(async () => target.dispatchEvent(new Event(event)))

  expect(timer.elapsed).toBe(305)
  expect(timer.reached).toBe(true)
  expect(timer.running).toBe(true)
  expect(onComplete).not.toHaveBeenCalled()

  // 復帰イベントが重なっても二重加算しない。
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('pageshow'))
  })
  expect(timer.elapsed).toBe(305)
})

it('preserves fractions of a second across pauses and excludes time spent paused', async () => {
  await act(async () => root.render(createElement(Harness, { seconds: 5 })))
  await act(async () => timer.toggle())
  vi.setSystemTime(Date.now() + 1600)
  await act(async () => timer.toggle())
  expect(timer.elapsed).toBe(1)
  expect(timer.running).toBe(false)

  await tick(30)
  await act(async () => window.dispatchEvent(new Event('focus')))
  expect(timer.elapsed).toBe(1)

  await act(async () => timer.toggle())
  vi.setSystemTime(Date.now() + 400)
  await act(async () => timer.toggle())
  expect(timer.elapsed).toBe(2)

  await act(async () => timer.toggle())
  await tick(3)
  expect(timer.elapsed).toBe(5)
  expect(timer.reached).toBe(true)
  expect(onComplete).not.toHaveBeenCalled()
})

it('checks actual elapsed time when finishing before the display has updated', async () => {
  await act(async () => root.render(createElement(Harness, { seconds: 5 })))
  await act(async () => timer.toggle())
  vi.setSystemTime(Date.now() + 4999)
  await act(async () => timer.finish())
  expect(timer.reached).toBe(false)
  expect(timer.running).toBe(true)
  expect(onComplete).not.toHaveBeenCalled()

  vi.setSystemTime(Date.now() + 1)
  await act(async () => {
    timer.finish()
    timer.finish()
  })
  expect(timer.elapsed).toBe(5)
  expect(timer.running).toBe(true)
  expect(onComplete).toHaveBeenCalledTimes(1)
  await tick(3)
  expect(timer.elapsed).toBe(8)
})

it('discards the running clock on reset', async () => {
  await act(async () => root.render(createElement(Harness, { seconds: 5 })))
  await act(async () => timer.toggle())
  vi.setSystemTime(Date.now() + 10000)
  await act(async () => timer.reset())

  await tick(3)
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('pageshow'))
  })
  expect(timer.elapsed).toBe(0)
  expect(timer.running).toBe(false)
  expect(timer.reached).toBe(false)
  expect(onComplete).not.toHaveBeenCalled()

  await act(async () => timer.toggle())
  await tick(1)
  expect(timer.elapsed).toBe(1)
  expect(timer.running).toBe(true)
})

it.each([false, true])('preserves the timer when recording directly (running = %s)', async (running) => {
  await act(async () => root.render(createElement(Harness, { seconds: 5 })))
  await act(async () => timer.toggle())
  vi.setSystemTime(Date.now() + 2600)
  if (!running) await act(async () => timer.toggle())
  await act(async () => timer.complete())
  expect(timer.elapsed).toBe(2)
  expect(timer.running).toBe(running)

  await tick(10)
  expect(timer.elapsed).toBe(running ? 12 : 2)
  await act(async () => timer.finish())
  expect(onComplete).not.toHaveBeenCalled()

  await act(async () => timer.toggle())
  await tick(1)
  expect(timer.running).toBe(!running)
  expect(timer.elapsed).toBe(running ? 12 : 3)
})

it('preserves the paused timer when recording and allows resuming it', async () => {
  await act(async () => root.render(createElement(Harness, { seconds: 5 })))
  await act(async () => timer.toggle())
  await tick(6)
  await act(async () => timer.toggle())
  await act(async () => timer.finish())
  expect(timer.running).toBe(false)
  expect(onComplete).toHaveBeenCalledTimes(1)
  await tick(10)
  expect(timer.elapsed).toBe(6)

  await act(async () => timer.toggle())
  await tick(2)
  expect(timer.elapsed).toBe(8)
  expect(timer.running).toBe(true)
  await act(async () => timer.finish())
  expect(onComplete).toHaveBeenCalledTimes(1)
})

it('allows another record attempt after a failed save and blocks clicks during the save', async () => {
  let resolve!: (saved: boolean) => void
  onComplete.mockReturnValueOnce(new Promise<boolean>((done) => { resolve = done })).mockResolvedValueOnce(true)
  await act(async () => root.render(createElement(Harness, { seconds: 5 })))
  await act(async () => timer.toggle())
  await tick(5)
  let operation!: ReturnType<typeof timer.finish>
  await act(async () => { operation = timer.finish(); void timer.finish() })
  expect(timer.saving).toBe(true)
  expect(onComplete).toHaveBeenCalledOnce()
  await act(async () => { resolve(false); expect(await operation).toBe(false) })
  expect(timer.saving).toBe(false)
  await act(async () => { expect(await timer.finish()).toBe(true) })
  await act(async () => timer.finish())
  expect(onComplete).toHaveBeenCalledTimes(2)
})
