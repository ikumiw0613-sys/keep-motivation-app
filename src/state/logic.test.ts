import { describe, expect, it } from 'vitest'
import {
  MOODS,
  bestRun,
  cycleIndex,
  idleOf,
  initialState,
  key,
  moodOf,
  parseKey,
  runOf,
  shift,
  today,
  type State,
} from './logic'

describe('日付のものさし', () => {
  it('key() は YYYY-MM-DD を0埋めで返す', () => {
    expect(key(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('parseKey() と key() は行き来できる', () => {
    expect(key(parseKey('2026-09-22'))).toBe('2026-09-22')
  })

  it('shift() は月をまたいでも日をずらせる', () => {
    expect(key(shift(parseKey('2026-01-31'), 1))).toBe('2026-02-01')
  })
})

/* ------------------------------------------------------------------
 * サイクル（README 2章）
 * ------------------------------------------------------------------ */

/** 今日から n 日前の日付キー */
const ago = (n: number) => key(shift(today(initialState()), -n))

/**
 * テスト用の State。`startedAt` は「n日前」で指定し、達成日も
 * 「何日前につけたか」で渡す。実時間に寄りかからないための道具。
 */
const mk = (o: { cycleDays: number; startedDaysAgo: number; doneDaysAgo: number[] }): State => ({
  ...initialState(),
  cycleDays: o.cycleDays,
  startedAt: ago(o.startedDaysAgo),
  done: o.doneDaysAgo.map(ago),
})

describe('cycleIndex()', () => {
  it('起点の日は 0 番のサイクル', () => {
    expect(cycleIndex('2026-09-01', '2026-09-01', 3)).toBe(0)
  })

  it('サイクル長の境界で番号が上がる', () => {
    expect(cycleIndex('2026-09-03', '2026-09-01', 3)).toBe(0)
    expect(cycleIndex('2026-09-04', '2026-09-01', 3)).toBe(1)
  })

  it('起点より前は負になる（どのサイクルにも属さない）', () => {
    expect(cycleIndex('2026-08-31', '2026-09-01', 3)).toBe(-1)
  })
})

describe('runOf() / idleOf()', () => {
  it('今日つければ 1サイクル連続で、放置は 0', () => {
    const s = mk({ cycleDays: 1, startedDaysAgo: 0, doneDaysAgo: [0] })
    expect(runOf(s)).toBe(1)
    expect(idleOf(s)).toBe(0)
  })

  it('進行中のサイクルも、つけた時点で連続に数える', () => {
    const s = mk({ cycleDays: 1, startedDaysAgo: 2, doneDaysAgo: [2, 1, 0] })
    expect(runOf(s)).toBe(3)
  })

  it('1サイクルの猶予。直前サイクルまで続いていれば連続は残る', () => {
    const s = mk({ cycleDays: 1, startedDaysAgo: 2, doneDaysAgo: [2, 1] })
    expect(idleOf(s)).toBe(1)
    expect(runOf(s)).toBe(2)
  })

  it('2サイクル放置すると連続は 0 に落ちる', () => {
    const s = mk({ cycleDays: 1, startedDaysAgo: 3, doneDaysAgo: [3, 2] })
    expect(idleOf(s)).toBe(2)
    expect(runOf(s)).toBe(0)
  })

  it('1サイクルに何回つけても1サイクル達成', () => {
    const s = mk({ cycleDays: 3, startedDaysAgo: 2, doneDaysAgo: [2, 1, 0] })
    expect(runOf(s)).toBe(1)
  })

  it('週1回（7日サイクル）でも、週に1回つければ連続が伸びる', () => {
    const s = mk({ cycleDays: 7, startedDaysAgo: 20, doneDaysAgo: [20, 13, 6] })
    expect(idleOf(s)).toBe(0)
    expect(runOf(s)).toBe(3)
  })

  it('今より先のサイクルの記録は数えない', () => {
    // 「翌日にする」で進めたあとに読み直すと、未来の日付の記録が残ることがある
    const s: State = { ...mk({ cycleDays: 1, startedDaysAgo: 1, doneDaysAgo: [1, 0] }), done: [ago(1), ago(0), ago(-1)] }
    expect(idleOf(s)).toBe(0)
    expect(runOf(s)).toBe(2)
  })

  it('記録が無ければ idle は null', () => {
    expect(idleOf(mk({ cycleDays: 1, startedDaysAgo: 0, doneDaysAgo: [] }))).toBeNull()
  })

  it('起点より前の記録は数えない', () => {
    const s = mk({ cycleDays: 1, startedDaysAgo: 1, doneDaysAgo: [5, 4, 1, 0] })
    expect(runOf(s)).toBe(2)
  })
})

describe('bestRun()', () => {
  it('いちばん長かった連続を返す（今の連続が短くても）', () => {
    const s = mk({ cycleDays: 1, startedDaysAgo: 9, doneDaysAgo: [9, 8, 7, 6, 3, 0] })
    expect(bestRun(s)).toBe(4)
    expect(runOf(s)).toBe(1)
  })

  it('記録が無ければ 0', () => {
    expect(bestRun(mk({ cycleDays: 1, startedDaysAgo: 0, doneDaysAgo: [] }))).toBe(0)
  })
})

describe('moodOf()', () => {
  const mood = (o: { cycleDays: number; startedDaysAgo: number; doneDaysAgo: number[] }) =>
    moodOf(mk(o))?.id

  it('記録が無ければ「気分なし」（＝たまご）', () => {
    expect(moodOf(mk({ cycleDays: 1, startedDaysAgo: 0, doneDaysAgo: [] }))).toBeNull()
  })

  it('1サイクル連続なら すこし元気', () => {
    expect(mood({ cycleDays: 1, startedDaysAgo: 0, doneDaysAgo: [0] })).toBe('ok')
  })

  it('2サイクル連続なら 元気', () => {
    expect(mood({ cycleDays: 1, startedDaysAgo: 1, doneDaysAgo: [1, 0] })).toBe('good')
  })

  it('3〜6サイクル連続なら いきいき', () => {
    expect(mood({ cycleDays: 1, startedDaysAgo: 2, doneDaysAgo: [2, 1, 0] })).toBe('lively')
    expect(mood({ cycleDays: 1, startedDaysAgo: 5, doneDaysAgo: [5, 4, 3, 2, 1, 0] })).toBe('lively')
  })

  it('7サイクル連続から かがやき', () => {
    expect(mood({ cycleDays: 1, startedDaysAgo: 6, doneDaysAgo: [6, 5, 4, 3, 2, 1, 0] })).toBe('shine')
  })

  it('2サイクル放置で うつむき、3サイクルで ぐったり', () => {
    expect(mood({ cycleDays: 1, startedDaysAgo: 3, doneDaysAgo: [3, 2] })).toBe('low')
    expect(mood({ cycleDays: 1, startedDaysAgo: 4, doneDaysAgo: [4, 3] })).toBe('down')
  })

  it('しずみこみは止めているので、4サイクル以上放置しても ぐったり', () => {
    expect(mood({ cycleDays: 1, startedDaysAgo: 5, doneDaysAgo: [5, 4] })).toBe('down')
    expect(mood({ cycleDays: 1, startedDaysAgo: 9, doneDaysAgo: [9, 8] })).toBe('down')
    expect(MOODS.some((m) => m.id === 'sink')).toBe(false)
  })

  it('サイクルが長くても段は同じ（3サイクル＝9日 放置）', () => {
    expect(mood({ cycleDays: 3, startedDaysAgo: 12, doneDaysAgo: [12, 9] })).toBe('down')
  })

  it('うつむきは色を変えず、休むだけ。ぐったりは叩いても反応しない', () => {
    const low = MOODS.find((m) => m.id === 'low')!
    expect(low.restOnly).toBe(true)
    expect(low.pokeable).toBe(true)
    expect(MOODS.find((m) => m.id === 'down')!.pokeable).toBe(false)
  })

  it('すこし元気は跳ばず、背筋はまっすぐ', () => {
    const ok = MOODS.find((m) => m.id === 'ok')!
    expect(ok.jumps).toBe(false)
    expect(ok.upright).toBe(true)
  })

  it('すこし元気〜かがやきは、どれもいきいきの色', () => {
    const lively = MOODS.find((m) => m.id === 'lively')!
    for (const id of ['ok', 'good', 'shine']) {
      const m = MOODS.find((x) => x.id === id)!
      expect([m.s, m.l]).toEqual([lively.s, lively.l])
    }
  })

  it('落ち込んでも明度は 58 より下げない', () => {
    for (const m of MOODS) expect(m.l).toBeGreaterThanOrEqual(58)
  })
})
