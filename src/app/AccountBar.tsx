import Logo from '../ui/Logo'
import ServiceInfoLink from '../ui/ServiceInfoLink'

type Props = {
  email: string
  onSignOut: () => void
  onShowTutorial?: () => void
}

export default function AccountBar({ email, onSignOut, onShowTutorial }: Props) {
  return (
    <div className="account-bar" role="group" aria-label="アカウント">
      <div className="account-brand">
        <Logo width={30} />
        <div className="account-brand-copy"><span>がんばり畑</span><ServiceInfoLink compact /></div>
      </div>
      <div className="account-meta">
        {onShowTutorial && (
          <button type="button" className="btn ghost account-tutorial" onClick={onShowTutorial}>
            チュートリアル
          </button>
        )}
        <span className="account-user" title={email}>
          <span className="account-avatar" aria-hidden="true">
            {(email[0] ?? '?').toUpperCase()}
          </span>
          <span className="account-email">{email}</span>
        </span>
        <button type="button" className="btn ghost account-signout" onClick={onSignOut}>
          ログアウト
        </button>
      </div>
    </div>
  )
}
