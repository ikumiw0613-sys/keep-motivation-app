import { useRef, useState } from 'react'
import Logo from '../ui/Logo'
import ServiceInfoLink from '../ui/ServiceInfoLink'
import type { SignUpResult } from '../state/useAuth'

type Props = {
  /** 成功なら null、失敗ならそのまま出すエラー文言を返す */
  onSignIn: (email: string, password: string) => Promise<string | null>
  onSignUp: (email: string, password: string) => Promise<SignUpResult>
  onSignInWithGoogle: () => Promise<string | null>
  authError?: string | null
  onRequestPasswordReset?: (email: string) => Promise<string | null>
  onResendConfirmation?: (email: string) => Promise<string | null>
}

/** ログインと新規登録。認証済みのセッションへの遷移は App に任せる。 */
export default function LoginPage({ onSignIn, onSignUp, onSignInWithGoogle, authError, onRequestPasswordReset, onResendConfirmation }: Props) {
  const [registering, setRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const submitting = useRef(false)

  const ready = email.trim().length > 0 && password.length > 0 && (!registering || confirmation.length > 0)
  const displayedError = error ?? authError

  const signInWithGoogle = async () => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setGoogleBusy(true)
    setError(null)
    setNotice(null)
    setPassword('')
    setConfirmation('')
    try {
      setError(await onSignInWithGoogle())
    } catch {
      setError('通信できませんでした。接続を確認して、もう一度お試しください。')
    } finally {
      submitting.current = false
      setBusy(false)
      setGoogleBusy(false)
    }
  }

  const switchMode = () => {
    if (submitting.current) return
    setRegistering(!registering)
    setPassword('')
    setConfirmation('')
    setError(null)
    setNotice(null)
  }

  const sendEmail = async (kind: 'reset' | 'confirmation') => {
    if (submitting.current) return
    if (!email.trim() || !isEmailValid(email.trim())) {
      setError('有効なメールアドレスを入力してください。')
      return
    }
    const send = kind === 'reset' ? onRequestPasswordReset : onResendConfirmation
    if (!send) return
    submitting.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const message = await send(email.trim())
      setError(message)
      if (!message) setNotice(kind === 'reset'
        ? '登録済みのメールアドレスの場合、再設定メールを送信しました。メール内のリンクから新しいパスワードを設定してください。'
        : '確認が必要なアカウントの場合、確認メールを再送しました。迷惑メールもご確認ください。')
    } catch {
      setError('通信できませんでした。接続を確認して、もう一度お試しください。')
    } finally {
      submitting.current = false
      setBusy(false)
    }
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
        {notice && <p className="login-notice" role="status">{notice}</p>}
        {displayedError && <p className="login-error" role="alert">{displayedError}</p>}
        <button className="btn google-sign-in" type="button" onClick={signInWithGoogle} disabled={busy}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
            <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.67-.35-3.94H24v7.46h11a9.4 9.4 0 0 1-4.08 6.17v5h6.61c3.87-3.56 6.08-8.8 6.08-14.69Z" />
            <path fill="#34A853" d="M24 44c5.51 0 10.13-1.83 13.51-4.95l-6.61-5c-1.83 1.23-4.18 1.97-6.9 1.97-5.31 0-9.82-3.59-11.43-8.42H5.75v5.15A20 20 0 0 0 24 44Z" />
            <path fill="#FBBC05" d="M12.57 27.6a12 12 0 0 1 0-7.2v-5.15H5.75a20 20 0 0 0 0 17.5l6.82-5.15Z" />
            <path fill="#EA4335" d="M24 11.98c3 0 5.67 1.03 7.8 3.06l5.85-5.85A19.6 19.6 0 0 0 24 4 20 20 0 0 0 5.75 15.25l6.82 5.15C14.18 15.57 18.69 11.98 24 11.98Z" />
          </svg>
          {googleBusy ? 'Googleへ移動中...' : 'Googleでログイン'}
        </button>
        <div className="login-divider"><span>またはメールで{registering ? '新規登録' : 'ログイン'}</span></div>
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

        <button className="btn" type="submit" disabled={!ready || busy}>
          {busy && !googleBusy ? (registering ? '作成中...' : 'ログイン中...') : (registering ? 'アカウントを作成' : 'ログイン')}
        </button>
        <button className="btn ghost login-switch" type="button" onClick={switchMode} disabled={busy}>
          {registering ? 'アカウントをお持ちの方はログイン' : 'アカウントを新規作成'}
        </button>
        {!registering && onRequestPasswordReset && (
          <button className="btn ghost login-switch" type="button" onClick={() => sendEmail('reset')} disabled={busy}>
            パスワードを忘れた方
          </button>
        )}
        {onResendConfirmation && (
          <button className="btn ghost login-switch login-resend" type="button" onClick={() => sendEmail('confirmation')} disabled={busy}>
            確認メールを再送する
          </button>
        )}
      </form>
      <p className="service-info"><ServiceInfoLink /></p>
    </div>
  )
}

function isEmailValid(email: string) {
  const input = document.createElement('input')
  input.type = 'email'
  input.value = email
  return input.checkValidity()
}
