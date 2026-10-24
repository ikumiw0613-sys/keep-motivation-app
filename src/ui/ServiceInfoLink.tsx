export default function ServiceInfoLink({ compact = false }: { compact?: boolean }) {
  return <a className="service-info-link" href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener noreferrer"
    aria-label="利用案内・プライバシー（新しいタブで開きます）">{compact ? '利用案内' : '利用案内・プライバシー'}</a>
}
