import { calendarDate } from './calendarDate'

/**
 * ゲームのルール。**ここには「記録から計算するやり方」だけを置く。**
 *
 * 活力（0〜100 の保存値）は廃止した。連続サイクル数も気分もステージも、
 * `done`（達成日）と `cycleDays` / `startedAt` から毎回その場で計算する。
 * 保存するのは「進化の演出をどこまで見せたか」（`seenStage`）だけ。
 */

export const SESSION = 300 // 秒

export type State = {
  goalId: number | null
  goal: string
  deadline: string | null // YYYY-MM-DD（目標の期限）
  /** 何日に1回つけるか。サイクル長（README 2章） */
  cycleDays: number
  /** サイクルの起点。目標を作った日 YYYY-MM-DD */
  startedAt: string | null
  /** アバターの色相 0〜359 */
  hue: number
  name: string
  /** 進化の演出をどこまで見せたか。記録から計算できない唯一の保存値 */
  seenStage: number
  /** お試し用。アプリの中の日付だけをずらす */
  dayOffset: number
  /** 達成日 YYYY-MM-DD。`records` から作る配列。カレンダーと `isDone()` が使う */
  done: string[]
}

export type SetupInput = {
  goal: string
  deadline: string
  /** 何日に1回つけるか。**あとから変えられない**（README 2章） */
  cycleDays: number
  /** アバターの色相 0〜359 */
  hue: number
  name: string
}

/** 目標を直すときに変えられるもの。**ペース（`cycleDays`）は入らない** */
export type GoalEdit = Omit<SetupInput, 'cycleDays'>

/** 「n日に1回」の選択肢。**頻度が難易度設定として働く** */
export const CYCLES: { days: number; label: string; note: string }[] = [
  { days: 1, label: '毎日', note: '1日に1回つける' },
  { days: 2, label: '2日に1回', note: '2日で1サイクル' },
  { days: 3, label: '3日に1回', note: '3日で1サイクル' },
  { days: 7, label: '週に1回', note: '7日で1サイクル' },
]

export const cycleLabel = (days: number) =>
  CYCLES.find((c) => c.days === days)?.label ?? `${days}日に1回`

/**
 * 色の選択肢。**数字は色相そのもの**なので、増やしたければ足すだけでいい。
 * 最初の3つは、アバター3種（もりお / だいち / こむぎ）だった頃の色。
 */
export const HUES: { hue: number; label: string }[] = [
  { hue: 150, label: 'みどり' },
  { hue: 205, label: 'あお' },
  { hue: 344, label: 'ピンク' },
  { hue: 38, label: 'きいろ' },
  { hue: 275, label: 'むらさき' },
  { hue: 12, label: 'オレンジ' },
]

export const initialState = (): State => ({
  goalId: null,
  goal: '',
  deadline: null,
  cycleDays: 1,
  startedAt: null,
  hue: 150,
  name: '',
  seenStage: 0,
  dayOffset: 0,
  done: [],
})

export const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const shift = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const addMonths = (d: Date, n: number) => {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}

export const today = (s: State) => shift(parseKey(calendarDate()), s.dayOffset)

export const isDone = (s: State, d: Date) => s.done.includes(key(d))

export const fmtClock = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/** 期限までの残り日数（負なら期限切れ） */
export const daysUntil = (s: State): number | null => {
  if (!s.deadline) return null
  const t0 = parseKey(key(today(s))).getTime()
  return Math.round((parseKey(s.deadline).getTime() - t0) / 86400000)
}

/** 期限切れかどうか */
export const isExpired = (s: State) => {
  const d = daysUntil(s)
  return d !== null && d < 0
}


/** 目標を作り直す。**アバターはたまごから** */
export function resetGoal(state: State): State {
  return {
    ...state,

    goalId: null,
    goal: '',
    deadline: null,
    cycleDays: 1,
    startedAt: null,
    seenStage: 0,

    done: [],
    dayOffset: 0,
  }
}


/* ------------------------------------------------------------------
 * サイクル ― すべての判定の単位（README 2章）
 *
 * 「n日に1回」の n が `cycleDays`。連続もサボりも「日」ではなく
 * 「サイクル」で数えるので、週1回の人が毎日しょんぼりすることがない。
 * 判定はすべて日単位で、境界はサイクル初日の午前0時。
 * ------------------------------------------------------------------ */

/** 日付キーの差（日数）。`to` が後なら正 */
export const diffDays = (from: string, to: string) =>
  Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86400000)

/**
 * その日が何番目のサイクルか。起点の日が 0 番。
 * 起点より前の日は負になる（＝どのサイクルにも属さない）。
 */
export const cycleIndex = (day: string, startedAt: string, cycleDays: number) =>
  Math.floor(diffDays(startedAt, day) / Math.max(1, cycleDays))

/** サイクルの起点。目標がまだ無いときは今日を起点とみなす */
export const startOf = (s: State) => s.startedAt ?? key(today(s))

/** 今のサイクル番号 */
export const currentCycle = (s: State) =>
  cycleIndex(key(today(s)), startOf(s), s.cycleDays)

/**
 * 達成したサイクルの番号。1サイクルに何回つけても1サイクル達成なので集合で持つ。
 * 起点より前の記録は捨てる（ペースを変えたときに「連続だけ切る」ため）。
 */
export const doneCycles = (done: string[], startedAt: string, cycleDays: number) => {
  const set = new Set<number>()
  for (const d of done) {
    const i = cycleIndex(d, startedAt, cycleDays)
    if (i >= 0) set.add(i)
  }
  return set
}

/**
 * 達成の記録があるいちばん新しいサイクル。記録が無ければ null。
 *
 * **今より先のサイクルは数えない。** 端末の時計がずれていたり、お試しの
 * 「翌日にする」で進めたあとに読み直したりすると、未来の記録が残っていることが
 * ある。数えてしまうと、ステージ（今のサイクルまでしか見ない）と連続数が食い違う。
 */
export const lastDoneCycle = (s: State): number | null => {
  const cycles = doneCycles(s.done, startOf(s), s.cycleDays)
  const now = currentCycle(s)
  let last: number | null = null
  for (const i of cycles) if (i <= now && (last === null || i > last)) last = i
  return last
}

/** 放置しているサイクル数。今のサイクルを達成済みなら 0。記録が無ければ null */
export const idleOf = (s: State): number | null => {
  const last = lastDoneCycle(s)
  return last === null ? null : currentCycle(s) - last
}

/**
 * 連続達成サイクル数。進行中のサイクルも、つけた時点で数に入る。
 *
 * **1サイクルぶんの猶予**は `idle == 1` のとき連続を残すことで表す。
 * 2サイクル放置したら 0 に落ちる。
 */
export const runOf = (s: State): number => {
  const last = lastDoneCycle(s)
  if (last === null) return 0
  if (currentCycle(s) - last >= 2) return 0

  const cycles = doneCycles(s.done, startOf(s), s.cycleDays)
  let n = 0
  for (let i = last; i >= 0 && cycles.has(i); i--) n++
  return n
}

/** いちばん長かった連続達成サイクル数（旧 `best` の代わり） */
export const bestRun = (s: State): number => {
  const cycles = doneCycles(s.done, startOf(s), s.cycleDays)
  let best = 0
  let run = 0
  const last = lastDoneCycle(s)
  if (last === null) return 0
  for (let i = 0; i <= last; i++) {
    run = cycles.has(i) ? run + 1 : 0
    if (run > best) best = run
  }
  return best
}

/* ------------------------------------------------------------------
 * 連続ボーナス（気分）
 *
 * 気分はステージ1以上のもの。卵に気分は無い（記録が無ければ null）。
 * **落ち込み（ぐったり）は彩度で表し、明度は下げない**（下限 58）。暗く沈めると
 * 汚く見えるし、前かがみ（droop）とどんよりのエフェクトで十分沈んで見える。
 * **すこし元気〜かがやきは色を変えない。** どれもいきいきの色（`BASE_S` / `BASE_L`）で、
 * 色選択画面の見本と同じ。元気さの差は動き・表情・エフェクトで見せる。
 * うつむきは彩度だけ少し落とす（明度はそのまま）。
 *
 * 落ち込みは本来2段（3サイクル放置のぐったり、4サイクル放置のしずみこみ）で、
 * 差は色ではなく**姿勢のクリップで見せる**（avatar/look.ts の `SIT_OF`）。
 * **いまはしずみこみを止めている。** 3サイクル以上の放置はすべてぐったり。しずみこみの定義は `SINK_MOOD` に残してあるので、戻すときは
 * `MOODS` の先頭に入れ直すだけでいい。
 * ------------------------------------------------------------------ */

export type MoodId = 'sink' | 'down' | 'low' | 'ok' | 'good' | 'lively' | 'shine'

export type Mood = {
  id: MoodId
  name: string
  /** 彩度 */
  s: number
  /** 明度 */
  l: number
  /** 0〜1。低いと歩き出さず、立ち止まったままになる */
  liveliness: number
  /**
   * 歩かず・跳ばず、座って休むだけにする。`liveliness` を下げずに動きだけ
   * 止めたいとき用（下げると前かがみ `droop` まで変わってしまう）
   */
  restOnly: boolean
  /** 叩いたときに反応するか。false ならタップしても何もしない */
  pokeable: boolean
  /** 歩き回る合間に跳ぶか。false なら歩く・休むだけ */
  jumps: boolean
  /**
   * 前かがみにしない。true なら `liveliness` によらず背筋をまっすぐにする。
   * 前かがみ（`droop`）は落ち込んだときだけの姿勢にしたいので
   */
  upright: boolean
  /** アバターが輝く（後光とからだの発光）。7サイクル連続から */
  glow: boolean
  /** 光の粒が立ちのぼる。3サイクル連続から */
  motes: boolean
  /** どんより（暗いもやと沈む粒）。3サイクル放置から */
  gloom: boolean
}

/**
 * ふだんの色（いきいき）。すこし元気〜かがやきはこの色のまま変えない。
 * 色選択画面の見本（SetupPage の `SAMPLE_MOOD`）と同じ色にしておくため
 */
const BASE_S = 56
const BASE_L = 80

/** 気分の表の1行。当てはまるかどうか（`hit`）を持つ */
type MoodRow = Mood & { hit: (run: number, idle: number) => boolean }

/**
 * しずみこみ（4サイクル放置）。**いまは止めていて `MOODS` に入っていない。**
 * 戻すときはこれを `MOODS` の先頭（ぐったりより前）に入れ直す。
 * 姿勢（Sink クリップ）や目の形など、見た目側の対応は look.ts に残してある
 */
export const SINK_MOOD: MoodRow = {
  id: 'sink',
  name: 'しずみこみ',
  // 彩度をここまで落とすと色味がほとんど消える。**明度は下げない**ので
  // 汚くはならず、沈んで見えるぶんは姿勢（Sink クリップ）が受け持つ
  s: 4,
  l: 58,
  liveliness: 0,
  restOnly: false,
  pokeable: true,
  jumps: false,
  upright: false,
  glow: false,
  motes: false,
  gloom: true,
  hit: (_run, idle) => idle >= 4,
}

/**
 * 気分の表。**上から順に見て、最初に当てはまったものを採る。**
 * 数字を動かしたいときはこの表だけを触ればいい。
 */
export const MOODS: MoodRow[] = [
  {
    id: 'down',
    name: 'ぐったり',
    s: 8,
    l: 58,
    liveliness: 0,
    // 叩いても反応しない。へたり込んで、それどころではない
    restOnly: false,
    pokeable: false,
    jumps: false,
    upright: false,
    glow: false,
    motes: false,
    gloom: true,
    hit: (_run, idle) => idle >= 3,
  },
  {
    id: 'low',
    name: 'うつむき',
    // 彩度だけ少し落とす。**明度はいきいきのまま**なので暗くはならず、
    // 落ち込みは主に動きの少なさで見せる
    s: 40,
    l: BASE_L,
    liveliness: 0.2,
    // 歩き回らず、座って休むのと叩かれたときの反応だけ
    restOnly: true,
    pokeable: true,
    jumps: false,
    upright: false,
    glow: false,
    motes: false,
    gloom: false,
    hit: (_run, idle) => idle >= 2,
  },
  {
    id: 'ok',
    name: 'すこし元気',
    s: BASE_S,
    l: BASE_L,
    liveliness: 0.4,
    restOnly: false,
    pokeable: true,
    // 跳ばず、背筋はまっすぐ。歩いて休むだけ
    jumps: false,
    upright: true,
    glow: false,
    motes: false,
    gloom: false,
    hit: (run) => run <= 1,
  },
  {
    id: 'good',
    name: '元気',
    s: BASE_S,
    l: BASE_L,
    liveliness: 0.6,
    restOnly: false,
    pokeable: true,
    jumps: true,
    upright: true,
    glow: false,
    motes: false,
    gloom: false,
    hit: (run) => run === 2,
  },
  {
    id: 'lively',
    name: 'いきいき',
    s: BASE_S,
    l: BASE_L,
    liveliness: 0.9,
    restOnly: false,
    pokeable: true,
    jumps: true,
    upright: true,
    glow: false,
    motes: true,
    gloom: false,
    hit: (run) => run <= 6,
  },
  {
    id: 'shine',
    name: 'かがやき',
    s: BASE_S,
    l: BASE_L,
    liveliness: 1,
    restOnly: false,
    pokeable: true,
    jumps: true,
    upright: true,
    glow: true,
    motes: true,
    gloom: false,
    hit: (run) => run >= 7,
  },
]

/** 今の気分。記録が1つも無ければ「気分なし」（＝たまご） */
export const moodOf = (s: State): Mood | null => {
  const idle = idleOf(s)
  if (idle === null) return null
  const run = runOf(s)
  const hit = MOODS.find((m) => m.hit(run, idle)) ?? MOODS[MOODS.length - 1]
  const { hit: _drop, ...mood } = hit
  return mood
}
