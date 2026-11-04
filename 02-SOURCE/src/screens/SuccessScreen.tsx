type Props = {
  message: string
  siteName: string
  pcName: string
}

export function SuccessScreen({ message, siteName, pcName }: Props) {
  return (
    <div className="center-panel">
      <div className="card">
        <div className="success-icon">✓</div>
        <h1 style={{ textAlign: 'center' }}>{message}</h1>
        <p style={{ textAlign: 'center' }}>Opening betting platform…</p>

        <div className="detail-row">
          <span>Shop</span>
          <span>{siteName}</span>
        </div>
        <div className="detail-row">
          <span>Terminal name</span>
          <span>{pcName}</span>
        </div>
      </div>
    </div>
  )
}
