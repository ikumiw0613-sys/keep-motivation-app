// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { User } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialState, type GoalEdit, type SetupInput } from './logic'
import { useApp } from './useApp'

const hooks = vi.hoisted(() => ({ auth: vi.fn(), goal: vi.fn() }))
vi.mock('./useAuth', () => ({ useAuth: hooks.auth }))
vi.mock('./useGoalState', () => ({ useGoalState: hooks.goal }))

function user(id: string): User {
  return { id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' }
}

function fixtures() {
  const auth = {
    user: user('account-a') as User | null,
    ready: true,
    authError: null,
    tutorialCompleted: false,
    completeTutorial: vi.fn(async () => true),
    signIn: vi.fn(),
    signInWithGoogle: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(async () => {}),
  }
  const goal = {
    state: initialState(),
    loaded: true,
    loadError: null as string | null,
    retryLoad: vi.fn(),
    hasStarted: false,
    hasGoalHistory: false,
    start: vi.fn(async (_input: SetupInput) => true),
    reset: vi.fn(),
    markStarted: vi.fn(),
    markSessionDone: vi.fn(),
    markStageSeen: vi.fn(),
    nextDay: vi.fn(),
    extendDeadline: vi.fn(),
    newGoal: vi.fn(),
    updateGoal: vi.fn(async (_input: GoalEdit) => true),
  }
  return { auth, goal }
}

const setup: SetupInput = {
  goal: '毎日読書する', deadline: '2027-01-01', cycleDays: 1, hue: 150, name: 'みどり',
}

describe('login and tutorial flow', () => {
  let root: Root
  let container: HTMLDivElement
  let app: ReturnType<typeof useApp>
  let data: ReturnType<typeof fixtures>
  let renders: { loaded: boolean; screen: string }[]

  function Harness() {
    app = useApp()
    renders.push({ loaded: app.loaded, screen: app.screen })
    return createElement('div', null, app.loaded ? app.screen : 'loading')
  }

  async function render() {
    await act(async () => { root.render(createElement(Harness)) })
  }

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    window.history.replaceState(null, '', '/')
    data = fixtures()
    hooks.auth.mockImplementation(() => data.auth)
    hooks.goal.mockImplementation(() => data.goal)
    renders = []
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    container.remove()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it.each([
    { completed: false, history: false, active: false, screen: 'top' },
    { completed: true, history: false, active: false, screen: 'setup' },
    { completed: true, history: true, active: true, screen: 'main' },
    { completed: false, history: true, active: true, screen: 'main' },
    { completed: false, history: true, active: false, screen: 'setup' },
  ])('opens $screen on login and refresh: $completed / $history / $active', async (testCase) => {
    data.auth.tutorialCompleted = testCase.completed
    data.goal.hasGoalHistory = testCase.history
    data.goal.hasStarted = testCase.active
    data.goal.state.goalId = testCase.active ? 1 : null
    await render()

    expect(app.loaded).toBe(true)
    expect(app.screen).toBe(testCase.screen)
    expect(renders.filter((entry) => entry.loaded).every((entry) => entry.screen === testCase.screen)).toBe(true)

    // A browser refresh recreates the hooks with the same persisted account data.
    await act(async () => { root.unmount() })
    root = createRoot(container)
    renders = []
    await render()
    expect(app.screen).toBe(testCase.screen)
    expect(renders.filter((entry) => entry.loaded).every((entry) => entry.screen === testCase.screen)).toBe(true)
  })

  it('waits for goals to load before showing an entry page', async () => {
    data.auth.tutorialCompleted = true
    data.goal.loaded = false
    await render()
    expect(app.loaded).toBe(false)
    expect(container.textContent).toBe('loading')

    data.goal.hasStarted = true
    data.goal.hasGoalHistory = true
    data.goal.state.goalId = 9
    data.goal.loaded = true
    await render()

    expect(app.screen).toBe('main')
    expect(renders.filter((entry) => entry.loaded).map((entry) => entry.screen)).not.toContain('top')
    expect(renders.filter((entry) => entry.loaded).map((entry) => entry.screen)).not.toContain('setup')
  })

  it('returns from the new goal page to the goal that was open', async () => {
    data.auth.tutorialCompleted = true
    data.goal.hasStarted = true
    data.goal.hasGoalHistory = true
    data.goal.state.goalId = 3
    const goal = data.goal as typeof data.goal & { currentGoalId: number | null; selectGoal: (id: number) => void }
    goal.currentGoalId = 3
    goal.selectGoal = vi.fn()
    await render()
    expect(app.cancelNewGoal).toBeNull()

    await act(async () => { app.newGoal() })
    expect(app.screen).toBe('setup')
    expect(app.cancelNewGoal).not.toBeNull()

    await act(async () => { app.cancelNewGoal!() })
    expect(goal.selectGoal).toHaveBeenCalledExactlyOnceWith(3)
    expect(app.screen).toBe('main')
    expect(app.cancelNewGoal).toBeNull()
  })

  it('opens the edit page for the open goal and returns to the dashboard after saving', async () => {
    data.auth.tutorialCompleted = true
    data.goal.hasStarted = true
    data.goal.hasGoalHistory = true
    data.goal.state.goalId = 3
    await render()
    expect(app.screen).toBe('main')

    await act(async () => { app.editGoal() })
    expect(app.screen).toBe('edit')

    const edit = { goal: '週3で走る', deadline: '2027-02-01', hue: 205, name: 'あお' }
    await act(async () => { await app.saveGoal(edit) })
    expect(data.goal.updateGoal).toHaveBeenCalledExactlyOnceWith(edit)
    expect(app.screen).toBe('main')
  })

  it('stays on the edit page when saving fails, and can go back without saving', async () => {
    data.auth.tutorialCompleted = true
    data.goal.hasStarted = true
    data.goal.hasGoalHistory = true
    data.goal.state.goalId = 3
    data.goal.updateGoal.mockResolvedValueOnce(false)
    await render()

    await act(async () => { app.editGoal() })
    await act(async () => { await app.saveGoal({ goal: 'x', deadline: '2027-02-01', hue: 150, name: 'y' }) })
    expect(app.screen).toBe('edit')

    await act(async () => { app.cancelEdit() })
    expect(app.screen).toBe('main')
  })

  it('keeps loading failures out of the tutorial and exposes retry', async () => {
    data.goal.loaded = false
    data.goal.loadError = '読み込みに失敗しました'
    await render()

    expect(app.loaded).toBe(false)
    expect(app.loadError).toBe(data.goal.loadError)
    await act(async () => { app.retryLoad() })
    expect(data.goal.retryLoad).toHaveBeenCalledOnce()
  })

  it('waits for tutorial completion to save before opening setup', async () => {
    let finish!: (saved: boolean) => void
    data.auth.completeTutorial.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve }))
    await render()

    let completion!: ReturnType<typeof app.completeTutorial>
    await act(async () => { completion = app.completeTutorial() })
    expect(data.auth.completeTutorial).toHaveBeenCalledOnce()
    expect(app.screen).toBe('top')

    await act(async () => {
      data.auth.tutorialCompleted = true
      finish(true)
      await completion
    })
    expect(app.screen).toBe('setup')
    expect(app.tutorialCompleted).toBe(true)
  })

  it('stays on the tutorial if completion could not be saved', async () => {
    data.auth.completeTutorial.mockResolvedValue(false)
    await render()
    await act(async () => { await app.completeTutorial() })
    expect(app.screen).toBe('top')
    expect(app.tutorialCompleted).toBe(false)
  })

  it('cannot bypass the tutorial or create a goal by navigating to the dashboard', async () => {
    await render()
    await act(async () => { app.go('main') })
    expect(app.screen).toBe('top')
    expect(data.goal.markStarted).not.toHaveBeenCalled()
    expect(data.goal.start).not.toHaveBeenCalled()

    await act(async () => { app.go('setup') })
    expect(app.screen).toBe('top')
  })

  it('cannot return to a completed tutorial or open the dashboard without a goal', async () => {
    data.auth.tutorialCompleted = true
    await render()
    await act(async () => { app.go('top') })
    expect(app.screen).toBe('setup')
    await act(async () => { app.go('main') })
    expect(app.screen).toBe('setup')
    expect(data.goal.markStarted).not.toHaveBeenCalled()

    await act(async () => { app.reset() })
    expect(app.screen).toBe('setup')
    expect(app.tutorialCompleted).toBe(true)
  })

  it('opens the dashboard only after goal creation succeeds', async () => {
    data.auth.tutorialCompleted = true
    data.goal.start.mockResolvedValueOnce(false).mockImplementationOnce(async () => {
      data.goal.hasStarted = true
      data.goal.hasGoalHistory = true
      data.goal.state.goalId = 42
      return true
    })
    await render()

    await act(async () => { await app.start(setup) })
    expect(app.screen).toBe('setup')
    await act(async () => { await app.start(setup) })
    expect(app.screen).toBe('main')
    expect(data.goal.start).toHaveBeenLastCalledWith(setup)
  })

  it('preserves manual goal setup when the same account refreshes its token', async () => {
    data.auth.tutorialCompleted = true
    data.goal.hasStarted = true
    data.goal.hasGoalHistory = true
    data.goal.state.goalId = 7
    await render()
    await act(async () => { app.go('setup') })
    expect(app.screen).toBe('setup')

    data.auth.user = user('account-a')
    await render()
    expect(app.screen).toBe('setup')
  })

  it('selects a fresh entry page when switching accounts without flashing the old page', async () => {
    data.auth.tutorialCompleted = true
    data.goal.hasStarted = true
    data.goal.hasGoalHistory = true
    data.goal.state.goalId = 7
    await render()
    expect(app.screen).toBe('main')

    data.auth.user = user('account-b')
    data.auth.tutorialCompleted = false
    data.goal = fixtures().goal
    data.goal.loaded = false
    renders = []
    await render()
    expect(app.loaded).toBe(false)

    data.goal.loaded = true
    await render()
    expect(app.screen).toBe('top')
    expect(renders.filter((entry) => entry.loaded).every((entry) => entry.screen === 'top')).toBe(true)
  })

  it('does not change the new account screen when the previous tutorial save finishes', async () => {
    let finish!: (saved: boolean) => void
    data.auth.completeTutorial.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve }))
    await render()
    let completion!: ReturnType<typeof app.completeTutorial>
    await act(async () => { completion = app.completeTutorial() })

    data.auth.user = user('account-b')
    data.auth.tutorialCompleted = true
    data.goal.hasStarted = true
    data.goal.hasGoalHistory = true
    data.goal.state.goalId = 8
    await render()
    expect(app.screen).toBe('main')

    await act(async () => {
      finish(true)
      await completion
    })
    expect(app.screen).toBe('main')
  })

  it('does not leave the new account setup when the previous goal save finishes', async () => {
    let finish!: (saved: boolean) => void
    data.auth.tutorialCompleted = true
    data.goal.start.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve }))
    await render()
    let creation!: ReturnType<typeof app.start>
    await act(async () => { creation = app.start(setup) })

    data.auth.user = user('account-b')
    data.goal.hasStarted = true
    data.goal.hasGoalHistory = true
    data.goal.state.goalId = 8
    await render()
    await act(async () => { app.go('setup') })

    await act(async () => {
      finish(true)
      await creation
    })
    expect(app.screen).toBe('setup')
  })
})
