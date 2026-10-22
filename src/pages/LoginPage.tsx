import { useRef, useState } from 'react'
import Logo from '../ui/Logo'
import type { SignUpResult } from '../state/useAuth'

type Props = {
  /** 成功なら null、失敗ならそのまま出すエラー文言を返す */
  onSignIn: (email: string, password: string) => Promise<string | null>
  onSignUp: (email: string, password: string) => Promise<SignUpResult>
}

/** ログインと新規登録。認証済みのセッションへの遷移は App に任せる。 */
export default function LoginPage({ onSignIn, onSignUp }: Props) {
  const [registering, setRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  const ready = email.trim().length > 0 && password.length > 0 && (!registering || confirmation.length > 0)

  const switchMode = () => {
    if (submitting.current) return
    setRegistering(!registering)
    setPassword('')
    setConfirmation('')
    setError(null)
    setNotice(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || submitting.current) return
    setError(null)
    setNotice(null)
    if (registering && password.length < 8) {
      setError('パスワードは8文字以上で入力してください。')
      return
    }
    if (registering && password !== confirmation) {
      setError('確認用パスワードが一致しません。')
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      if (registering) {
        const result = await onSignUp(email.trim(), password)
        if (result.status === 'error') {
          setError(result.message)
        } else if (result.status === 'confirmation-required') {
          setRegistering(false)
          setNotice('確認メールをご確認ください。メール内のリンクを開いて登録を完了した後、ログインしてください。届かない場合は迷惑メールもご確認ください。すでに登録済みの方はログインしてください。')
        }
      } else {
        setError(await onSignIn(email.trim(), password))
      }
    } catch {
      setError('通信できませんでした。接続を確認して、もう一度お試しください。')
    } finally {
      setPassword('')
      setConfirmation('')
      submitting.current = false
      setBusy(false)
    }
    // 成功したときは onAuthStateChange が App のゲートを開ける
  }

  return (
    <div className="wrap login">
      <header className="login-head">
        <Logo width={44} />
        <h1>がんばり畑</h1>
        <p>{registering ? 'アカウントを作成して、目標を育てはじめましょう。' : 'ログインすると、自分の目標と記録が出てきます。'}</p>
      </header>

      <form className="card login-card" onSubmit={submit}>
        <h2 className="login-title">{registering ? 'アカウントの新規作成' : 'ログイン'}</h2>
        <div className="setup-block">
          <label className="setup-label" htmlFor="login-email">
            メールアドレス
          </label>
          <input
            className="setup-input"
            id="login-email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="setup-block">
          <label className="setup-label" htmlFor="login-password">
            パスワード
          </label>
          <input
            className="setup-input"
            id="login-password"
            type="password"
            autoComplete={registering ? 'new-password' : 'current-password'}
            required
            disabled={busy}
            aria-describedby={registering ? 'signup-password-hint' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {registering && <p className="login-hint" id="signup-password-hint">8文字以上で入力してください。</p>}
        </div>

        {registering && (
          <div className="setup-block">
            <label className="setup-label" htmlFor="signup-password-confirmation">パスワード（確認）</label>
            <input className="setup-input" id="signup-password-confirmation" type="password"
              autoComplete="new-password" required disabled={busy} value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)} />
          </div>
        )}

        {notice && <p className="login-notice" role="status">{notice}</p>}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button className="btn" type="submit" disabled={!ready || busy}>
          {busy ? (registering ? '作成中...' : 'ログイン中...') : (registering ? 'アカウントを作成' : 'ログイン')}
        </button>
        <button className="btn ghost login-switch" type="button" onClick={switchMode} disabled={busy}>
          {registering ? 'アカウントをお持ちの方はログイン' : 'アカウントを新規作成'}
        </button>
      </form>
    </div>
  )
}
