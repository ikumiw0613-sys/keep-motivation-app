// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGoalState } from './useGoalState'

const database = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: database }))

type Reply = { data: unknown; error: { message: string } | null }
type ReadPlan = { table: string; run: () => Promise<Reply> }
const plans: ReadPlan[] = []
const reads: ReadQuery[] = []

/** Only SELECT is supported: any accidental database write fails the test. */
class ReadQuery {
  columns = ''
  filters: [string, string, unknown][] = []
  orders: { column: string; ascending: boolean }[] = []
  maxRows: number | null = null
  constructor(readonly table: string, private readonly run: ReadPlan['run']) {}
  select(columns: string) { this.columns = columns; return this }
  eq(column: string, value: unknown) { this.filters.push(['eq', column, value]); return this }
  in(column: string, values: unknown[]) { this.filters.push(['in', column, values]); return this }
  order(column: string, options = { ascending: true }) { this.orders.push({ column, ascending: options.ascending }); return this }
  limit(count: number) { this.maxRows = count; return this }
  maybeSingle() { return this.run() }
  then(resolve: (reply: Reply) => unknown, reject: (error: unknown) => unknown) {
    return this.run().then(resolve, reject)
  }
}

const ok = (data: unknown): Reply => ({ data, error: null })
const failed: Reply = { data: null, error: { message: 'read failed' } }
const enqueue = (table: string, reply: Reply) => plans.push({ table, run: () => Promise.resolve(
  table === 'goals' && reply.data && !Array.isArray(reply.data)
    ? { ...reply, data: [reply.data] } : reply
) })
const goalRow = (id = 1) => ({
  id,
  goal: `Goal ${id}`,
  deadline: '2026-12-31',
  cycle_days: 3,
  started_at: '2026-09-01',
  avatars: [{ name: `Avatar ${id}`, hue: 120, seen_stage: 1 }],
})

function enqueueGoal(id = 1) {
  enqueue('goals', ok(goalRow(id)))
  enqueue('records', ok([{ goal_id: id, done_on: '2026-09-02' }]))
}

function deferred() {
  let resolve!: (value: Reply) => void
  const promise = new Promise<Reply>((done) => { resolve = done })
  return { promise, resolve }
}

let root: Root
let container: HTMLDivElement
let current: ReturnType<typeof useGoalState>
const snapshots: { userId: string | null; loaded: boolean; goalId: number | null; hasStarted: boolean; hasGoalHistory: boolean }[] = []

function Probe({ userId }: { userId: string | null }) {
  current = useGoalState(userId)
  snapshots.push({
    userId,
    loaded: current.loaded,
    goalId: current.state.goalId,
    hasStarted: current.hasStarted,
    hasGoalHistory: current.hasGoalHistory,
  })
  return null
}

async function render(userId: string | null) {
  await act(async () => { root.render(createElement(Probe, { userId })) })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.clear()
  plans.length = 0
  reads.length = 0
  snapshots.length = 0
  database.from.mockReset()
  database.rpc.mockReset()
  database.from.mockImplementation((table: string) => {
    const plan = plans.shift()
    expect(plan?.table).toBe(table)
    if (!plan) throw new Error(`Unexpected query: ${table}`)
    const query = new ReadQuery(table, plan.run)
    reads.push(query)
    return query
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  expect(plans).toHaveLength(0)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useGoalState loading', () => {
  it('keeps multiple goals and their records separate when selecting and reloading', async () => {
    const rows = [goalRow(2), goalRow(1)]
    const records = [{ goal_id: 1, done_on: '2026-09-02' }, { goal_id: 2, done_on: '2026-09-03' }]
    enqueue('goals', ok(rows))
    enqueue('records', ok(records))
    await render('account-a')
    expect(current.currentGoalId).toBe(2)
    expect(current.goals).toHaveLength(2)
    expect(current.state.done).toEqual(['2026-09-03'])
    await act(async () => current.selectGoal(1))
    expect(current.state.goalId).toBe(1)
    expect(current.state.done).toEqual(['2026-09-02'])
    expect(reads).toHaveLength(2)
    expect(localStorage.getItem('kma.currentGoal.account-a')).toBe('1')
    await act(async () => current.setDayOffset(-2))
    enqueue('goals', ok(rows))
    enqueue('records', ok(records))
    await act(async () => current.reload())
    expect(current.state.goalId).toBe(1)
    expect(current.state.dayOffset).toBe(-2)
    await render(null)
    enqueue('goals', ok(rows))
    enqueue('records', ok(records))
    await render('account-a')
    expect(current.currentGoalId).toBe(1)
    expect(current.state.dayOffset).toBe(0)
  })

  it('falls back to the newest goal if the saved selection no longer exists', async () => {
    localStorage.setItem('kma.currentGoal.account-a', '99')
    enqueueGoal(2)
    await render('account-a')
    expect(current.currentGoalId).toBe(2)
    await act(async () => current.selectGoal(99))
    expect(current.currentGoalId).toBe(2)
  })

  it('clears deleted goals on reload while retaining tutorial completion evidence', async () => {
    enqueueGoal()
    await render('account-a')
    enqueue('goals', ok([]))
    await act(async () => current.reload())
    expect(current.loaded).toBe(true)
    expect(current.goals).toEqual([])
    expect(current.currentGoalId).toBeNull()
    expect(current.hasStarted).toBe(false)
    expect(current.hasGoalHistory).toBe(true)
  })

  it('loads the current account’s goal, avatar and records before reporting ready', async () => {
    enqueueGoal()
    await render('account-a')

    expect(current.loaded).toBe(true)
    expect(current.loadError).toBeNull()
    expect(current.hasStarted).toBe(true)
    expect(current.hasGoalHistory).toBe(true)
    expect(current.state).toMatchObject({
      goalId: 1,
      goal: 'Goal 1',
      deadline: '2026-12-31',
      cycleDays: 3,
      startedAt: '2026-09-01',
      name: 'Avatar 1',
      hue: 120,
      seenStage: 1,
      done: ['2026-09-02'],
    })
    expect(reads[0].filters).toEqual([['eq', 'user_id', 'account-a']])
    expect(reads[0].orders).toEqual([{ column: 'id', ascending: false }])
    expect(reads[0].maxRows).toBeNull()
    expect(reads[0].columns).not.toContain('archived_at')
    expect(reads[1].filters).toContainEqual(['in', 'goal_id', [1]])
    expect(reads).toHaveLength(2)
  })

  it('reports no current goal or history when the account has no goal rows', async () => {
    enqueue('goals', ok(null))
    await render('account-a')

    expect(current.loaded).toBe(true)
    expect(current.loadError).toBeNull()
    expect(current.hasStarted).toBe(false)
    expect(current.state.goalId).toBeNull()
    expect(current.hasGoalHistory).toBe(false)
    expect(reads).toHaveLength(1)
  })

  it.each(['goal', 'records', 'network'] as const)('surfaces a %s read failure and recovers after retry', async (failure) => {
    if (failure === 'network') {
      plans.push({ table: 'goals', run: () => Promise.reject(new Error('network unavailable')) })
    } else if (failure === 'goal') {
      enqueue('goals', failed)
    } else {
      enqueue('goals', ok(goalRow()))
      enqueue('records', failed)
    }
    await render('account-a')

    expect(current.loaded).toBe(false)
    expect(current.loadError).toBeTruthy()
    expect(current.hasStarted).toBe(false)
    expect(current.state.goalId).toBeNull()
    expect(console.error).toHaveBeenCalledTimes(1)

    const retry = current.retryLoad
    const pending = deferred()
    plans.push({ table: 'goals', run: () => pending.promise })
    await act(async () => retry())
    expect(current.loaded).toBe(false)
    expect(current.loadError).toBeNull()

    enqueue('records', ok([]))
    await act(async () => pending.resolve(ok([goalRow()])))
    expect(current.loaded).toBe(true)
    expect(current.loadError).toBeNull()
    expect(current.hasStarted).toBe(true)
    expect(current.state.goalId).toBe(1)
    expect(current.retryLoad).toBe(retry)
  })

  it('keeps tutorial evidence when reset or newGoal clears the current goal', async () => {
    enqueueGoal()
    await render('account-a')

    await act(async () => current.newGoal())
    expect(current.hasStarted).toBe(false)
    expect(current.hasGoalHistory).toBe(true)
    await act(async () => current.reset())
    expect(current.hasGoalHistory).toBe(true)
    expect(reads).toHaveLength(2)
  })

  it('masks the previous account on the first render after switching accounts', async () => {
    enqueueGoal()
    await render('account-a')
    const beforeSwitch = snapshots.length
    const pending = deferred()
    plans.push({ table: 'goals', run: () => pending.promise })
    await render('account-b')

    expect(snapshots[beforeSwitch]).toEqual({
      userId: 'account-b', loaded: false, goalId: null, hasStarted: false, hasGoalHistory: false,
    })
    expect(current.loaded).toBe(false)
    await act(async () => pending.resolve(ok(null)))
    expect(current.loaded).toBe(true)
    expect(current.hasStarted).toBe(false)
    expect(current.hasGoalHistory).toBe(false)
    expect(current.state.goalId).toBeNull()
  })

  it.each(['goal', 'records'] as const)('ignores a slow previous account’s %s response', async (phase) => {
    const pending = deferred()
    if (phase === 'goal') {
      plans.push({ table: 'goals', run: () => pending.promise })
    } else {
      enqueue('goals', ok(goalRow(1)))
      plans.push({ table: 'records', run: () => pending.promise })
    }
    await render('account-a')
    expect(current.loaded).toBe(false)

    enqueueGoal(2)
    await render('account-b')
    expect(current.state.goalId).toBe(2)
    await act(async () => pending.resolve(phase === 'goal' ? ok([goalRow(1)]) : ok([])))
    expect(current.loaded).toBe(true)
    expect(current.state.goalId).toBe(2)
    expect(current.state.done).toEqual(['2026-09-02'])
  })

  it('clears account state on logout without querying anonymously', async () => {
    enqueueGoal()
    await render('account-a')
    await render(null)

    expect(current.loaded).toBe(false)
    expect(current.loadError).toBeNull()
    expect(current.hasStarted).toBe(false)
    expect(current.hasGoalHistory).toBe(false)
    expect(current.state.goalId).toBeNull()
    expect(reads).toHaveLength(2)
  })
})

const setupInput = { goal: 'Read daily', deadline: '2027-12-31', cycleDays: 1, name: 'Bird', hue: 150 }

describe('transactional goal saves', () => {
  it('ignores a previous account response during creation', async () => {
    enqueueGoal(1)
    await render('account-a')
    const pending = deferred()
    database.rpc.mockReturnValueOnce(pending.promise)
    let operation!: Promise<boolean>
    await act(async () => { operation = current.start(setupInput) })
    enqueue('goals', ok([]))
    await render('account-b')
    await act(async () => {
      pending.resolve(ok({ id: 10, started_at: '2026-10-24' }))
      expect(await operation).toBe(false)
    })
    expect(current.goals).toEqual([])
    expect(current.saving).toBe(false)
    expect(current.saveError).toBeNull()
  })

  it('serializes clicks and reuses the request ID after a lost response', async () => {
    enqueueGoal(1)
    await render('account-a')
    const pending = deferred()
    database.rpc.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(ok({ id: 2, started_at: '2026-10-24' }))
    let operation!: Promise<boolean>
    await act(async () => {
      operation = current.start(setupInput)
      expect(await current.start(setupInput)).toBe(false)
    })
    expect(current.saving).toBe(true)
    expect(database.rpc).toHaveBeenCalledOnce()
    await act(async () => {
      pending.resolve(failed)
      expect(await operation).toBe(false)
    })
    expect(current.state.goalId).toBe(1)
    expect(current.saveError).toContain('保存できませんでした')
    await act(async () => { expect(await current.start(setupInput)).toBe(true) })
    expect(database.rpc.mock.calls[0][1].p_request_id).toBe(database.rpc.mock.calls[1][1].p_request_id)
    expect(current.goals.map((goal) => goal.goalId)).toEqual([2, 1])
    expect(current.state.startedAt).toBe('2026-10-24')
    expect(current.saveError).toBeNull()
    expect(current.saving).toBe(false)
    expect(database.from).toHaveBeenCalledTimes(2)
  })

  it.each([false, true])('only changes goal and avatar together after save (failed = %s)', async (failure) => {
    enqueueGoal(1)
    await render('account-a')
    database.rpc.mockResolvedValueOnce(failure ? failed : ok(null))
    const input = { goal: 'New goal', deadline: '2027-12-31', name: 'New name', hue: 205 }
    await act(async () => { expect(await current.updateGoal(input)).toBe(!failure) })
    expect(database.rpc).toHaveBeenCalledExactlyOnceWith('update_goal_with_avatar', {
      p_goal_id: 1, p_goal: input.goal, p_deadline: input.deadline, p_name: input.name, p_hue: input.hue,
    })
    expect(current.state).toMatchObject({ goal: failure ? 'Goal 1' : 'New goal', name: failure ? 'Avatar 1' : 'New name',
      cycleDays: 3, seenStage: 1, done: ['2026-09-02'] })
    expect(current.saveError === null).toBe(!failure)
  })
})

describe('achievement persistence', () => {
  it('does not claim success before saving, retries a failure, and deduplicates clicks', async () => {
    enqueueGoal(1)
    await render('account-a')
    const pending = deferred()
    const insert = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(ok(null))
    database.from.mockImplementation(() => ({ insert }))
    let operation!: Promise<boolean>
    await act(async () => {
      operation = current.markSessionDone('2026-10-24')
      expect(current.markSessionDone('2026-10-24')).toBe(operation)
    })
    expect(insert).toHaveBeenCalledOnce()
    expect(current.state.done).not.toContain('2026-10-24')
    await act(async () => { pending.resolve(failed); expect(await operation).toBe(false) })
    expect(current.state.done).not.toContain('2026-10-24')
    await act(async () => { expect(await current.markSessionDone('2026-10-24')).toBe(true) })
    expect(current.state.done).toContain('2026-10-24')
    expect(insert).toHaveBeenCalledTimes(2)
  })

  it('accepts a duplicate stored day after a lost response', async () => {
    enqueueGoal(1)
    await render('account-a')
    database.from.mockImplementationOnce(() => ({ insert: async () => ({ error: { code: '23505' } }) }))
    await act(async () => { expect(await current.markSessionDone('2026-10-24')).toBe(true) })
    expect(current.state.done).toContain('2026-10-24')
  })

  it('does not apply a previous account achievement response', async () => {
    enqueueGoal(1)
    await render('account-a')
    const pending = deferred()
    database.from.mockImplementationOnce(() => ({ insert: () => pending.promise }))
    let operation!: Promise<boolean>
    await act(async () => { operation = current.markSessionDone('2026-10-24') })
    enqueueGoal(2)
    await render('account-b')
    await act(async () => { pending.resolve(ok(null)); expect(await operation).toBe(false) })
    expect(current.state.done).toEqual(['2026-09-02'])
  })
})
