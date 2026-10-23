import { describe, expect, it } from 'vitest'
import { initialState, key, shift, today } from '../state/logic'
import { evolutionOf, FINAL_FORM, nextGoalOf } from './stage'

/** 今日から n 日前の日付キー */
const ago = (n: number) => key(shift(today(initialState()), -n))
const TODAY = ago(0)

/** 「n日前に始めて、これらの日につけた」形でステージを出す */
const stage = (startedDaysAgo: number, doneDaysAgo: number[], cycleDays = 1) =>
  evolutionOf(doneDaysAgo.map(ago), cycleDays, ago(startedDaysAgo), TODAY).id

const next = (startedDaysAgo: number, doneDaysAgo: number[], cycleDays = 1) =>
  nextGoalOf(doneDaysAgo.map(ago), cycleDays, ago(startedDaysAgo), TODAY)

describe('evolutionOf()', () => {
  it('記録が無ければ たまご', () => {
    expect(stage(0, [])).toBe(0)
  })

  it('1サイクルだけではまだ たまご', () => {
    expect(stage(0, [0])).toBe(0)
  })

  it('2サイクル連続で 幼体', () => {
    expect(stage(1, [1, 0])).toBe(1)
  })

  it('幼体になったあと、直近5サイクルで4サイクル達成すると 成体', () => {
    // ✓✓✓✗✓ → 5サイクル目の時点で 直近5のうち4
    expect(stage(4, [4, 3, 2, 0])).toBe(2)
  })

  it('たまごから成体へは飛ばない。✓✓✓✓✗ は幼体を経由してから', () => {
    // 幼体（2連続）→ その後の窓で成体、の順に上がる
    expect(stage(4, [4, 3, 2, 1])).toBe(2)
  })

  it('一度上がったステージは下がらない', () => {
    // 2連続で幼体になったあと、ずっと放置しても幼体のまま
    expect(stage(30, [30, 29])).toBe(1)
  })

  it.runIf(FINAL_FORM)('14サイクル連続で 完全体', () => {
    const days = Array.from({ length: 14 }, (_, i) => 13 - i)
    expect(stage(13, days)).toBe(3)
  })

  it.skipIf(FINAL_FORM)('完全体が OFF の間は、14サイクル連続でも 成体どまり', () => {
    const days = Array.from({ length: 14 }, (_, i) => 13 - i)
    expect(stage(13, days)).toBe(2)
  })

  it('週1回（7日サイクル）でも、2回続ければ 幼体', () => {
    expect(stage(7, [7, 0], 7)).toBe(1)
  })

  it('起点より前の記録は数えない', () => {
    expect(stage(0, [3, 2])).toBe(0)
  })
})

describe('nextGoalOf()', () => {
  it('たまごの次は「連続 0 / 2」', () => {
    expect(next(0, [])).toMatchObject({ kind: 'run', have: 0, need: 2 })
  })

  it('幼体の次は窓の条件。「直近5サイクルで x / 4」', () => {
    expect(next(1, [1, 0])).toMatchObject({ kind: 'window', have: 2, need: 4, window: 5 })
  })

  it.runIf(FINAL_FORM)('成体の次は「連続 x / 14」', () => {
    expect(next(4, [4, 3, 2, 0])).toMatchObject({ kind: 'run', need: 14 })
  })

  it.skipIf(FINAL_FORM)('完全体が OFF の間は、成体が最終ステージ（null）', () => {
    expect(next(4, [4, 3, 2, 0])).toBeNull()
  })

  it('最終ステージなら null', () => {
    const days = Array.from({ length: 14 }, (_, i) => 13 - i)
    expect(next(13, days)).toBeNull()
  })
})
