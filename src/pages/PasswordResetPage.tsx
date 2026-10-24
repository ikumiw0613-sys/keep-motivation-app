import { useRef, useState, type FormEvent } from 'react'
import ServiceInfoLink from '../ui/ServiceInfoLink'

export default function PasswordResetPage({ onSave, onSignOut }: {
  onSave: (password: string) => Promise<string | null>
  onSignOut: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    if (password.length < 8 || password !== confirmation) {
      setError(password.length < 8 ? 'パスワードは8文字以上で入力してください。' : '確認用パスワードが一致しません。')
      return
    }
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      setError(await onSave(password))
    } catch {
      setError('通信できませんでした。接続を確認して、もう一度お試しください。')
    } finally {
      submitting.current = false
      setBusy(false)
      setPassword('')
      setConfirmation('')
    }
  }

  return (
    <div className="wrap login">
      <form className="card login-card" onSubmit={submit}>
        <h1 className="login-title">新しいパスワードを設定</h1>
        <p className="login-hint" id="reset-hint">8文字以上の、推測されにくいパスワードを入力してください。</p>
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="setup-block">
          <label className="setup-label" htmlFor="reset-password">新しいパスワード</label>
          <input className="setup-input" id="reset-password" type="password" autoComplete="new-password"
            required disabled={busy} aria-describedby="reset-hint" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        <div className="setup-block">
          <label className="setup-label" htmlFor="reset-confirmation">パスワード（確認）</label>
          <input className="setup-input" id="reset-confirmation" type="password" autoComplete="new-password"
            required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={busy || !password || !confirmation}>{busy ? '保存中…' : 'パスワードを変更する'}</button>
        <button className="btn ghost login-switch" type="button" onClick={onSignOut} disabled={busy}>ログアウトして戻る</button>
      </form>
      <p className="service-info"><ServiceInfoLink /></p>
    </div>
  )
}
