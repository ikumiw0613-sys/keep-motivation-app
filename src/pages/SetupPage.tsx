import { useRef, useState, type CSSProperties } from 'react'
import Avatar from '../avatar/Avatar'
import './setup-page.css'
import {
  CYCLES,
  HUES,
  MOODS,
  addMonths,
  key,
  parseKey,
  type SetupInput,
  type State,
} from '../state/logic'

type Props = {
  state: State
  onStart: (input: SetupInput) => void | boolean | Promise<void | boolean>
  /** 前の目標へ戻る。初めての目標づくりでは戻り先が無いので null */
  onBack: (() => void) | null
  /**
   * 開いている目標を直す画面として出す。`state` の値を入れた状態で始まり、
   * **ペースだけは変えられない**（見せるだけ）
   */
  editing?: boolean
  saving?: boolean
  saveError?: string | null
}

const PRESETS = [
  { n: 1, label: '1ヶ月後' },
  { n: 3, label: '3ヶ月後' },
  { n: 6, label: '半年後' },
  { n: 12, label: '1年後' },
]

/** 見本のアバター。**気分は「いきいき」で固定**。色で選べるように一番のびのびした姿を出す */
const SAMPLE_MOOD = MOODS.find((m) => m.id === 'lively') ?? null

export default function SetupPage({ state, onStart, onBack, editing = false, saving = false, saveError }: Props) {
  const [draft, setDraft] = useState(state.goal)
  const [deadline, setDeadline] = useState(state.deadline ?? '')
  const [cycleDays, setCycleDays] = useState(state.cycleDays || 1)
  const [hue, setHue] = useState(state.hue)
  const [name, setName] = useState(state.name)
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = pending || saving

  const todayKey = key(new Date())
  const daysTo = deadline
    ? Math.round((parseKey(deadline).getTime() - parseKey(todayKey).getTime()) / 86400000)
    : null

  // 名前は必須。アバター3種が無くなったので、既定値の出どころが無い
  const ready = draft.trim().length > 0 && deadline.length > 0 && name.trim().length > 0

  const submit = async () => {
    if (!ready || busy || submitting.current) return
    if (deadline < todayKey && !editing) {
      setError('期限は今日以降の日付を選んでください。')
      return
    }
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      if (await onStart({ goal: draft.trim(), deadline, cycleDays, hue, name: name.trim() }) === false) {
        setError('保存できませんでした。接続を確認して、もう一度保存してください。')
      }
    } catch {
      setError('保存できませんでした。接続を確認して、もう一度保存してください。')
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <div className="wrap setup">
      {onBack && (
        <button type="button" className="setup-back" onClick={onBack} disabled={busy}>
          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          ダッシュボードに戻る
        </button>
      )}
      <header className="setup-head">
        <small className="setup-kicker">{editing ? 'EDIT GOAL' : 'NEW GOAL'}</small>
        <h1>{editing ? '目標を修正する' : '目標をつくる'}</h1>
        {editing ? (
          <p>
            目標・期限・アバターの色と名前を直せます。
            これまでの記録とアバターの育ち具合はそのまま残ります。
          </p>
        ) : (
          <p>
            やることを細かく決めなくていい。決めたペースで机に向かえば、そのサイクルは達成。
            サイクルを続けるほどアバターは色づき、止まると色が抜けていく。
          </p>
        )}
      </header>

      {/* 選んだアバターの色をカードに持たせる。始めるボタンや入力欄の枠がその色になる */}
      <section className="card setup-card" style={{ '--h': hue } as CSSProperties} aria-busy={busy}>
        <fieldset className="setup-fields" disabled={busy}>
        {/* 項目は「目標」と「アバター」の2つに分ける。何を決めている欄かを見出しで先に伝える */}
        <section className="setup-group" aria-labelledby="setup-group-goal">
        <h2 className="setup-group-title" id="setup-group-goal">目標</h2>
        <div className="setup-block">
          <label className="setup-label" htmlFor="goal-input">
            目標はどうする？ <em>必須</em>
          </label>
          <input
            className="setup-input"
            id="goal-input"
            type="text"
            maxLength={30}
            placeholder="例: 資格の勉強"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit()
            }}
          />
        </div>

        <div className="setup-block">
          <label className="setup-label">
            目標の期限 <em>必須</em>
          </label>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.n}
                type="button"
                className={`preset${deadline === key(addMonths(new Date(), p.n)) ? ' active' : ''}`}
                onClick={() => setDeadline(key(addMonths(new Date(), p.n)))}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            className="date-field"
            type="date"
            min={todayKey}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          {daysTo !== null && <p className="hint">期限まであと {daysTo} 日</p>}
        </div>

        <div className="setup-block">
          <label className="setup-label">
            取り組むペース {!editing && <em>必須</em>}
          </label>
          <div className="freqs">
            {CYCLES.map((c) => (
              <button
                key={c.days}
                type="button"
                className={`seg${cycleDays === c.days ? ' active' : ''}`}
                aria-pressed={cycleDays === c.days}
                disabled={editing}
                onClick={() => setCycleDays(c.days)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="hint">
            連続もお休みも「日」ではなく<b>サイクル</b>で数えます。
            {cycleLabelNote(cycleDays)}
            <br />
            {editing
              ? <><b>ペースは変えられません。</b>変えたくなったら、新しい目標をたまごから始めます。</>
              : <><b>あとから変えられません。</b>変えたくなったら、新しい目標をたまごから始めます。</>}
          </p>
        </div>
        </section>

        <section className="setup-group" aria-labelledby="setup-group-avatar">
        <h2 className="setup-group-title" id="setup-group-avatar">アバター</h2>
        <div className="setup-block">
          <label className="setup-label">
            色 <em>必須</em>
          </label>
          {/* 見本の3D は1体だけ。色は CSS の丸で選ぶ。
              選択肢ごとに WebGL キャンバスを並べると、端末によっては
              それだけで描画が重くなる */}
          <div className="avatar-picker">
            <div className="avatar-sample">
              <Avatar stage={2} hue={hue} mood={SAMPLE_MOOD} />
            </div>
            <div className="hues" role="group" aria-label="アバターの色">
              {HUES.map((h) => (
                <button
                  key={h.hue}
                  type="button"
                  className={`hue-dot${hue === h.hue ? ' active' : ''}`}
                  style={{ '--dot': `hsl(${h.hue}, 56%, 70%)` } as CSSProperties}
                  aria-pressed={hue === h.hue}
                  aria-label={h.label}
                  title={h.label}
                  onClick={() => setHue(h.hue)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="setup-block">
          <label className="setup-label" htmlFor="name-input">
            名前 <em>必須</em>
          </label>
          <input
            className="setup-input"
            id="name-input"
            type="text"
            maxLength={12}
            placeholder="例: もりお"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        </section>

        </fieldset>
        {(saveError || error) && <p className="login-error" role="alert">{saveError || error}</p>}
        <button type="button" className="btn top-btn" onClick={submit} disabled={!ready || busy}>
          {busy ? '保存中…' : editing ? 'この内容で保存する' : 'この目標で始める'}
        </button>
      </section>
    </div>
  )
}

const cycleLabelNote = (days: number) =>
  days === 1 ? '1日が1サイクルです。' : `${days}日が1サイクルです。`
