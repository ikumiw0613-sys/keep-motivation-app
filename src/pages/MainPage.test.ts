// @vitest-environment jsdom
import { act, createElement, useState, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MainPage from './MainPage'
import { initialState, key, today, type State } from '../state/logic'
import { useTimer } from '../state/useTimer'

vi.mock('../avatar/Avatar', () => ({ default: () => null }))
vi.mock('../features/calendar/Calendar', () => ({ default: () => null }))

let root: Root
let container: HTMLDivElement
const select = vi.fn()
const newGoal = vi.fn()
const goal = (id: number): State => ({
  ...initialState(), goalId: id, goal: `目標${id}`, name: `アバター${id}`, deadline: '2099-12-31',
})

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  // jsdom does not implement the native dialog methods.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false } },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
  container.remove()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
})

async function render(expired = false) {
  const state = { ...goal(1), deadline: expired ? '2000-01-01' : '2099-12-31' }
  await renderDashboard({ state })
}

async function renderDashboard(overrides: Partial<ComponentProps<typeof MainPage>> = {}) {
  const state = overrides.state ?? goal(1)
  await act(async () => root.render(createElement(MainPage, {
    state, goals: [state, goal(2)], currentGoalId: 1, onSelectGoal: select,
    session: 300, elapsed: 0, running: false, reached: false, onToggleTimer: vi.fn(), onFinishTimer: vi.fn(),
    onNewGoal: newGoal, onEditGoal: vi.fn(), onExtend: vi.fn(), onStageSeen: vi.fn(),
    ...overrides,
  })))
}

async function clickButton(text: string) {
  const scope = container.querySelector('dialog[open]') ?? container
  const button = Array.from(scope.querySelectorAll('button')).find((item) => item.textContent?.includes(text))
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

it.each([false, true])('selects a goal inside the goal popup (expired = %s)', async (expired) => {
  await render(expired)
  expect(container.querySelector('.goal-list')).toBeNull()
  await clickButton(expired ? '目標一覧を見る' : '目標')
  const panel = container.querySelector<HTMLDialogElement>('.goals-dialog')!
  expect(panel.querySelectorAll('.goal-list > li')).toHaveLength(2)
  expect(panel.open).toBe(true)
  expect(container.querySelector('.dash-panel .goal-list')).toBeNull()
  expect(panel.querySelector('.goal-card.current')?.textContent).toContain('目標1')
  await clickButton('目標2')
  expect(select).toHaveBeenCalledExactlyOnceWith(2)
  expect(panel.open).toBe(false)
  expect(panel.querySelector('.goal-list')).toBeNull()
})

it('starts a new goal from the popup without asking', async () => {
  const confirm = vi.spyOn(window, 'confirm')
  await render()
  await clickButton('目標')
  await clickButton('新しい目標を作る')
  expect(confirm).not.toHaveBeenCalled()
  expect(newGoal).toHaveBeenCalledOnce()
})

it('disables timer actions until restoration finishes and offers retry on failure', async () => {
  const state = goal(1)
  const retry = vi.fn()
  const toggle = vi.fn()
  await act(async () => root.render(createElement(MainPage, {
    state, goals: [state], currentGoalId: 1, onSelectGoal: select,
    session: 300, elapsed: 120, running: false, reached: false,
    timerReady: false, timerError: 'タイマーを読み込めませんでした。', onRetryTimer: retry,
    onToggleTimer: toggle, onFinishTimer: vi.fn(), onNewGoal: newGoal,
    onEditGoal: vi.fn(), onExtend: vi.fn(), onStageSeen: vi.fn(),
  })))
  const timerButton = container.querySelector<HTMLButtonElement>('.stage-toggler')!
  expect(timerButton.disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('読み込めませんでした')
  await clickButton('再試行')
  expect(retry).toHaveBeenCalledOnce()
  expect(toggle).not.toHaveBeenCalled()
})

it('closes the list popup and returns to the dashboard', async () => {
  await render()
  await clickButton('目標')
  const dialog = container.querySelector<HTMLDialogElement>('.goals-dialog')!
  expect(dialog.open).toBe(true)
  expect(container.querySelector('.goal-list')).not.toBeNull()
  await act(async () => dialog.querySelector<HTMLButtonElement>('.panel-close')!.click())
  expect(dialog.open).toBe(false)
  expect(container.querySelector('.dash-panel')?.getAttribute('aria-hidden')).toBe('true')
  expect(container.querySelector('.goal-list')).toBeNull()
  await clickButton('目標')
  await act(async () => dialog.dispatchEvent(new Event('cancel')))
  expect(dialog.open).toBe(false)
  expect(container.querySelector('.goal-list')).toBeNull()
})

function TimerHarness({ recorded = false }: { recorded?: boolean }) {
  const [state, setState] = useState(() => {
    const state = goal(1)
    return recorded ? { ...state, done: [key(today(state))] } : state
  })
  const timer = useTimer(() => {
    setState((state) => ({ ...state, done: [...state.done, key(today(state))] }))
  }, 5)
  return createElement(MainPage, {
    state, goals: [state], currentGoalId: 1, onSelectGoal: select,
    session: 5, elapsed: timer.elapsed, running: timer.running, reached: timer.reached,
    onToggleTimer: timer.toggle, onFinishTimer: timer.finish,
    onNewGoal: newGoal, onEditGoal: vi.fn(), onExtend: vi.fn(), onStageSeen: vi.fn(),
  })
}

it('continues measuring after recording and offers pause and resume controls', async () => {
  vi.useFakeTimers()
  await act(async () => root.render(createElement(TimerHarness)))
  await clickButton('スタート')
  await act(async () => vi.advanceTimersByTime(6000))
  await clickButton('記録する')
  expect(container.querySelector('.timer-state')?.textContent).toBe('今日の目標達成')
  expect(container.querySelector('.timer-hint')?.textContent).toBe('5秒達成後も継続中')
  expect(container.querySelector('.clock')?.textContent).toBe('0:06')
  expect(container.querySelector('.stage-toggler.finish')).toBeNull()

  await act(async () => vi.advanceTimersByTime(2000))
  expect(container.querySelector('.clock')?.textContent).toBe('0:08')
  await clickButton('一時停止')
  await act(async () => vi.advanceTimersByTime(30000))
  expect(container.querySelector('.clock')?.textContent).toBe('0:08')
  await clickButton('再開')
  await act(async () => vi.advanceTimersByTime(2000))
  expect(container.querySelector('.clock')?.textContent).toBe('0:10')
})

it('can start a new timer on a recorded day and displays the actual elapsed time when paused', async () => {
  vi.useFakeTimers()
  await act(async () => root.render(createElement(TimerHarness, { recorded: true })))
  expect(container.querySelector('.clock')?.textContent).toBe('0:00')
  expect(container.querySelector('.timer-hint')?.textContent).toBe('今日の達成は記録ずみ')
  await clickButton('再開')
  await act(async () => vi.advanceTimersByTime(2000))
  await clickButton('一時停止')
  expect(container.querySelector('.clock')?.textContent).toBe('0:02')
  await clickButton('再開')
  await act(async () => vi.advanceTimersByTime(4000))
  expect(container.querySelector('.clock')?.textContent).toBe('0:06')
  expect(container.querySelector('.stage-toggler.finish')).toBeNull()
  expect(container.querySelector<HTMLButtonElement>('.stage-toggler')?.disabled).toBe(false)
})

it('shows remaining time before completion without a second timer total', async () => {
  await renderDashboard({ elapsed: 200, running: true })
  expect(container.querySelector('.clock')?.textContent).toBe('3:20')
  expect(container.querySelector('.timer-hint')?.textContent).toBe('あと1:40で今日の達成')
  expect(container.querySelector('.timer-state')?.textContent).not.toContain('目標達成')
  expect(container.querySelector('.ring')?.textContent).not.toContain('/ 5:00')
})

it('keeps the record action separate from reaching five minutes', async () => {
  const finish = vi.fn()
  await renderDashboard({ elapsed: 319, running: true, reached: true, onFinishTimer: finish })
  expect(container.querySelector('.timer-state')?.textContent).toBe('5分できました')
  expect(container.querySelector('.timer-hint')?.textContent).toBe('記録すると今日の達成に')
  await clickButton('記録する')
  expect(finish).toHaveBeenCalledOnce()
})

it.each([true, false])('shows achieved time with a truthful running state (running = %s)', async (running) => {
  const state = goal(1)
  state.done = [key(today(state))]
  await renderDashboard({ state, elapsed: 319, reached: true, running })
  expect(container.querySelector('.clock')?.textContent).toBe('5:19')
  expect(container.querySelector('.timer-state')?.textContent).toBe('今日の目標達成')
  expect(container.querySelector('.timer-hint')?.textContent).toBe(running ? '5分達成後も継続中' : '5分達成・一時停止中')
  expect(container.querySelector('.stage-toggler')?.textContent).toBe(running ? '一時停止' : '再開')
})

it('explains rolling growth progress from the existing five-cycle window', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T12:00:00+09:00'))
  await renderDashboard({ state: {
    ...goal(1), startedAt: '2026-10-15', seenStage: 1,
    done: ['2026-10-15', '2026-10-16', '2026-10-20', '2026-10-22'],
  } })
  expect(container.querySelector('.meter .row')?.textContent).toBe('成体まであと2回')
  expect(container.querySelector('.meter-note')?.textContent).toBe('直近5回中、2回達成')
})

it('counts growth by cycles even when several days belong to one cycle', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T12:00:00+09:00'))
  await renderDashboard({ state: {
    ...goal(1), startedAt: '2026-10-23', cycleDays: 3,
    done: ['2026-10-23', '2026-10-24'],
  } })
  expect(container.querySelector('.meter .row')?.textContent).toBe('幼体まであと1回')
  expect(container.querySelector('.meter-note')?.textContent).toBe('2回連続の達成で成長')
})

it('keeps goal editing accessible after compacting the action', async () => {
  const edit = vi.fn()
  await renderDashboard({ onEditGoal: edit })
  const button = container.querySelector<HTMLButtonElement>('[aria-label="目標を修正"]')!
  await act(async () => button.click())
  expect(edit).toHaveBeenCalledOnce()
})
