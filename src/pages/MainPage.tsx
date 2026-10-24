import { useEffect, useRef, useState, type ReactNode } from 'react'
import Calendar from '../features/calendar/Calendar'
import Avatar from '../avatar/Avatar'
import GoalsList from './GoalsList'
import './main-page.css'
import {
  bestRun,
  cycleLabel,
  daysUntil,
  fmtClock,
  isDone,
  isExpired,
  key,
  moodOf,
  runOf,
  startOf,
  today,
  type State,
} from '../state/logic'
import { evolutionOf, nextGoalOf } from '../avatar/stage'
import { useAccent } from '../ui/useAccent'

const DASH = 314.2 // 2π × 50（タイマーの輪の半径）

type PanelId = 'goal' | 'calendar'

/** 線のアイコン。文字（✎ ▣）だとフォントで形が変わるので SVG で持つ */
const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)
const FlagIcon = () => (
  <Icon>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </Icon>
)
const CalendarIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
)
const PencilIcon = () => (
  <Icon>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
)
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
)
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <rect x="6" y="5" width="4.2" height="14" rx="1.4" />
    <rect x="13.8" y="5" width="4.2" height="14" rx="1.4" />
  </svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
const FlameIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em">
    <path fill="#ff8a3d" d="M12 2c.6 3.2-1.2 4.9-2.8 6.6C7.6 10.3 6 12 6 14.8A6 6 0 0 0 12 21a6 6 0 0 0 6-6.2c0-3.1-1.7-5-3-6.5-.3 1.6-1 2.6-2 3.1.4-3.1-.1-6.3-1-9.4Z" />
    <path fill="#ffd166" d="M12 21a3.2 3.2 0 0 1-3.2-3.3c0-1.8 1.3-2.8 2.2-4 .4 1 .9 1.5 1.6 1.8.2-.8.6-1.4 1.1-1.9.9 1.1 1.5 2.2 1.5 3.9A3.2 3.2 0 0 1 12 21Z" />
  </svg>
)

const PANELS: { id: PanelId; label: string; icon: ReactNode }[] = [
  { id: 'goal', label: '目標', icon: <FlagIcon /> },
  { id: 'calendar', label: 'カレンダー', icon: <CalendarIcon /> },
]

type Props = {
  state: State
  goals: State[]
  currentGoalId: number | null
  onSelectGoal: (id: number) => void
  /** タイマーの長さ（秒）。本番は300、デバッグ画面は5（useApp） */
  session: number
  elapsed: number
  running: boolean
  /** 時間を過ぎた。未記録なら「記録する」を表示する */
  reached: boolean
  timerReady?: boolean
  timerBusy?: boolean
  timerError?: string | null
  onRetryTimer?: () => void
  onToggleTimer: () => void
  /** 今日の記録を付ける。計測は続ける */
  onFinishTimer: () => void
  onNewGoal: () => void
  /** 目標の修正画面を開く */
  onEditGoal: () => void
  onExtend: () => void
  /** 進化の演出を流し終わったら呼ぶ。`avatars.seen_stage` を進める */
  onStageSeen: (stage: number) => void
}

/** 演出を流す長さ。たまごが割れるクリップ（3.0秒）に少し余裕を足した値 */
const EFFECT_MS = 4200

export default function MainPage({
  state,
  goals,
  currentGoalId,
  onSelectGoal,
  session,
  elapsed,
  running,
  reached,
  timerReady = true,
  timerBusy = false,
  timerError = null,
  onRetryTimer,
  onToggleTimer,
  onFinishTimer,
  onNewGoal,
  onEditGoal,
  onExtend,
  onStageSeen,
}: Props) {
  const t = today(state)
  const doneToday = isDone(state, t)
  // 気分もステージも保存していない。**記録とサイクル長から毎回その場で計算する**
  const stage = evolutionOf(state.done, state.cycleDays, startOf(state), key(t))
  // **気分はステージ1以上のもの。** たまごに気分は無い
  const mood = stage.id === 0 ? null : moodOf(state)
  useAccent(state.hue, mood?.s ?? 24)
  const next = nextGoalOf(state.done, state.cycleDays, startOf(state), key(t))
  const run = runOf(state)
  const durationText = session % 60 === 0 ? `${session / 60}分` : `${session}秒`
  const timerHint = !timerReady
    ? '接続を確認しています'
    : doneToday
      ? ''
      : reached
        ? '記録すると今日の達成に'
        : `あと${fmtClock(Math.max(0, session - elapsed))}で今日の達成`

  // **演出は条件を満たした瞬間に1回だけ。** 計算したステージが
  // 「見せ終わったステージ」を超えていたら流し、終わってから記録を進める。
  // localStorage と違って DB に置くので、別の端末で開いても1回で済む
  const [celebrating, setCelebrating] = useState(false)
  const pending = stage.id > state.seenStage
  useEffect(() => {
    if (!pending) return
    setCelebrating(true)
    const id = window.setTimeout(() => {
      setCelebrating(false)
      onStageSeen(stage.id)
    }, EFFECT_MS)
    return () => window.clearTimeout(id)
    // onStageSeen は毎描画で作り直されるので、依存に入れると演出が流れ続ける
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, stage.id, state.goalId])

  // 孵化（たまご → 幼体）だけは、殻が割れるところから見せる
  const hatching = celebrating && state.seenStage === 0 && stage.id >= 1

  const expired = isExpired(state)
  const deadlineDays = daysUntil(state)
  const [yd, mo, dd] = (state.deadline ?? '').split('-').map(Number)
  const deadlineText = mo && dd ? `${mo}月${dd}日まで` : '設定されていません'
  const [open, setOpen] = useState<'calendar' | null>(null)
  const [showGoals, setShowGoals] = useState(false)
  const goalsDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (showGoals) goalsDialog.current?.showModal()
    else goalsDialog.current?.close()
  }, [showGoals])
  const closePanel = () => {
    setOpen(null)
    setShowGoals(false)
  }

  return (
    // 部屋の背景は画面いっぱいに敷く（dash-full）。期限切れの振り返りは部屋を出さないので、
    // 今までどおり余白のある枠に収める
    <div className={`wrap dashboard${expired ? '' : ' dash-full'}`}>
      <div className="dash-area">

      {expired ? (
          <section className="card done-overlay">
            <h2>目標の期間が終わりました</h2>
            <p className="sub">「{state.goal}」の振り返り</p>
            <div className="stats">
              <div>
                <b>{state.done.length}</b>
                <span>達成日数</span>
              </div>
              <div>
                <b>{run}</b>
                <span>今の連続サイクル</span>
              </div>
              <div>
                <b>{bestRun(state)}</b>
                <span>最長記録</span>
              </div>
            </div>
            {/* **ここから新しい目標は作らせない。** 期限が切れた直後は、
                作るより「他に育てているものがあったか」を見にいくほうが先。
                作りたければ目標一覧の「新しい目標を作る」から入れる */}
            <div className="acts done-acts">
              <button className="btn" onClick={() => setShowGoals(true)}>
                目標一覧を見る
              </button>
              <button className="btn sec" onClick={onExtend}>
                期限を1ヶ月伸ばす
              </button>
            </div>
          </section>
      ) : (
        <>
          <div className={`bg-stage${open ? ' dim' : ''}`}>
            {/* 左上の HUD。部屋の絵の上に乗るので、すりガラスのカードにして背景から浮かせる */}
            <div className="bg-top">
              {/* 気分は言葉にしない。姿勢や色、光の粒といったアバターの見た目で伝わる */}
              <div className="hud-card char-card">
                <p className="owner" title={state.name}>{state.name}</p>
                <span className="chip stage-chip">{stage.name}</span>
              </div>
              <div className="hud-card streak-card">
                <span className="streak-icon" aria-hidden="true">
                  <FlameIcon />
                </span>
                <b>{run}</b>
                <span className="streak-text">
                  回連続で達成
                  <small>{cycleLabel(state.cycleDays)}</small>
                </span>
              </div>
              {/* 進化ゲージ。下中央だとアバターにかぶって見づらいので、名前・連続日数の下に小さく置く。
                  残りは現在の条件との差。直近の集計も添え、連続・期間内の条件を区別する。 */}
              <div className="hud-card meter">
                <div className="row">
                  <span>
                    {next ? <>{next.stage.name}まであと<b>{Math.max(0, next.need - next.have)}</b>回</> : `${stage.name}まで成長！`}
                  </span>
                </div>
                <div className="gauge">
                  <i style={{ width: `${next ? Math.min(100, (next.have / next.need) * 100) : 100}%` }} />
                </div>
                {next && (
                  <p className="meter-note">
                    {next.kind === 'run'
                      ? `${next.need}回連続の達成で成長`
                      : `直近${next.window}回中、${next.have}回達成`}
                  </p>
                )}
              </div>
            </div>

            {/* 目標と期限も左上の HUD と同じカード・同じ字体にそろえる。
                部屋の絵の上に文字だけ置くと、壁の柄に負けて浮いて見える */}
            <section className="stage-goal" aria-label="現在の目標と期限">
              <div className="hud-card goal-hud">
                <div className="goal-hud-head">
                  <small className="hud-label">GOAL</small>
                  <button type="button" className="goal-edit" aria-label="目標を修正" onClick={onEditGoal}>
                    <span aria-hidden="true" className="goal-edit-icon"><PencilIcon /></span>
                    <span className="goal-edit-label">修正</span>
                  </button>
                </div>
                <p className="goal-hud-text" title={state.goal}>{state.goal}</p>
              </div>

              <div className={`hud-card deadline-card${deadlineDays !== null && deadlineDays <= 3 ? ' warn' : ''}`}>
                <small className="hud-label">DEADLINE</small>
                <div className="deadline-row">
                  <span className="deadline-date">{deadlineText}</span>
                  <p className="deadline-days">
                    {expired ? '期限から' : 'あと'}
                    <b>{deadlineDays !== null ? Math.abs(deadlineDays) : '—'}</b>
                    {expired ? '日経過' : '日'}
                  </p>
                </div>
              </div>
            </section>

            {celebrating && (
              <div className="evolve-banner" role="status">
                <small className="evolve-event">{state.seenStage === 0 ? 'うまれた！' : `${stage.name}に進化！`}</small>
                <b className="evolve-name">{state.name}</b>
                <p className="evolve-line">「{stage.says}」</p>
              </div>
            )}

            <div className={`stage-avatar${celebrating ? ' evolving' : ''}`}>
              <Avatar
                key={hatching ? 'egg' : 'chick'}
                stage={hatching ? 0 : stage.id}
                hue={state.hue}
                mood={hatching ? null : mood}
                egg={hatching}
                hatching={hatching}
                fill
                interactive
              />
            </div>

            <div className={`hud-card stage-timer${running ? ' running' : ''}${doneToday ? ' achieved' : ''}`} aria-label={`${durationText}タイマー`}>
              <div className="timer-head">
                <span className="hud-label">FOCUS</span>
                <span className={`timer-state${doneToday ? ' done' : ''}`}>
                  {timerBusy ? '保存中…' : timerError && !timerReady ? '接続待ち' : !timerReady ? '読み込み中…' : doneToday ? <><span className="timer-check" aria-hidden="true"><CheckIcon /></span>今日の目標達成</> : reached ? `${durationText}できました` : running ? '集中しています' : elapsed > 0 ? '一時停止中' : `${durationText}だけ、はじめよう`}
                </span>
              </div>
              <div className="ring">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <defs>
                    <linearGradient id="timer-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--h) 70% 62%)" />
                      <stop offset="100%" stopColor="hsl(calc(var(--h) - 14) 72% 46%)" />
                    </linearGradient>
                  </defs>
                  {/* 5等分の目盛り。本番の5分なら1分ごと */}
                  {Array.from({ length: 5 }, (_, i) => (
                    <line key={i} className="tick" x1="60" y1="1.5" x2="60" y2="5" transform={`rotate(${i * 72} 60 60)`} />
                  ))}
                  <circle className="track" cx="60" cy="60" r="50" />
                  <circle
                    className="prog"
                    cx="60"
                    cy="60"
                    r="50"
                    strokeDasharray={DASH}
                    strokeDashoffset={(DASH * (1 - Math.min(elapsed / session, 1))).toFixed(1)}
                  />
                </svg>
                <div className="num">
                  <span className="clock">{fmtClock(elapsed)}</span>
                </div>
              </div>
              <p className="timer-hint">{timerHint}</p>
              {reached && !doneToday ? (
                <button type="button" className="stage-toggler finish" onClick={onFinishTimer} disabled={!timerReady || timerBusy}>
                  <span aria-hidden="true" className="toggler-icon"><CheckIcon /></span>
                  記録する
                </button>
              ) : (
                <button
                  type="button"
                  className={`stage-toggler${running ? ' running' : ''}`}
                  aria-pressed={running}
                  aria-label={running ? '一時停止' : elapsed > 0 || doneToday ? '再開する' : 'タイマーをはじめる'}
                  onClick={onToggleTimer}
                  disabled={!timerReady || timerBusy}
                >
                  <span aria-hidden="true" className="toggler-icon">
                    {running ? <PauseIcon /> : <PlayIcon />}
                  </span>
                  <span aria-hidden="true">{running ? '一時停止' : elapsed > 0 || doneToday ? '再開' : 'スタート'}</span>
                </button>
              )}
              {timerError && (
                <div className="timer-feedback" role="alert">
                  <p>{timerError}</p>
                  <button type="button" className="btn ghost" onClick={onRetryTimer} disabled={timerBusy}>再試行</button>
                </div>
              )}
            </div>
          </div>

          <nav className="dash-menu" aria-label="メニュー">
            {PANELS.map((panel) => (
              <button
                key={panel.id}
                type="button"
                className={`menu-btn${(panel.id === 'goal' ? showGoals : open === panel.id) ? ' active' : ''}`}
                aria-pressed={panel.id === 'goal' ? showGoals : open === panel.id}
                aria-haspopup={panel.id === 'goal' ? 'dialog' : undefined}
                aria-controls={panel.id === 'goal' ? 'goal-list-dialog' : undefined}
                onClick={() => {
                  if (panel.id === 'goal') {
                    setOpen(null)
                    setShowGoals(true)
                    return
                  }
                  setOpen((current) => (current === 'calendar' ? null : 'calendar'))
                  setShowGoals(false)
                }}
              >
                <span aria-hidden="true" className="menu-icon">{panel.icon}</span>
                {panel.label}
              </button>
            ))}
          </nav>
        </>
      )}

          <section
            className={`dash-panel${open ? ' open' : ''}`}
            aria-hidden={open === null}
            inert={open === null}
            aria-label="ダッシュボードパネル"
          >
            <button type="button" className="panel-close" aria-label="閉じる" onClick={closePanel}>
              ✕
            </button>

            {open === 'calendar' && (
              <div className="panel-body">
                <h2>達成カレンダー</h2>
                <Calendar state={state} />
              </div>
            )}
          </section>
          <dialog
            ref={goalsDialog}
            id="goal-list-dialog"
            className="goals-dialog"
            aria-labelledby="goals-list-title"
            onCancel={() => setShowGoals(false)}
            onClose={() => setShowGoals(false)}
          >
            <button type="button" className="panel-close" aria-label="目標一覧を閉じる" onClick={() => setShowGoals(false)}>
              ✕
            </button>
            {showGoals && (
              <GoalsList
                goals={goals}
                currentGoalId={currentGoalId}
                onSelect={(id) => { onSelectGoal(id); closePanel() }}
                onNewGoal={onNewGoal}
              />
            )}
          </dialog>
        </div>
    </div>
  )
}
