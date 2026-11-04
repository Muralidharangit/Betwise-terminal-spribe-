import type { TerminalRegistration } from '../api/client'
import { getPortalSlug } from '../config/env'

type Props = {
  result: TerminalRegistration
  onContinue: () => void
}

export function RegistrationSuccessScreen({ result, onContinue }: Props) {
  const portal = result.portal_slug || getPortalSlug() || '—'
  const status = (result.status || 'AVAILABLE').toUpperCase()
  const token = result.registration_token || '—'

  const rows: { label: string; value: string; kind?: 'gold' | 'badge' }[] = [
    { label: 'Terminal Name:', value: result.pc_name || result.hostname || '—', kind: 'gold' },
    { label: 'Terminal Code:', value: result.machine_id || '—' },
    { label: 'Shop Name:', value: result.site_name || '—' },
    { label: 'Status:', value: status, kind: 'badge' },
    { label: 'Portal:', value: portal },
    { label: 'Token:', value: token },
  ]

  return (
    <div className="winbet-success-page">
      <div className="winbet-success-card">
        <div className="winbet-success-check" aria-hidden="true">
          <span>✓</span>
        </div>

        <h1 className="winbet-success-title">Terminal Registered!</h1>
        <p className="winbet-success-sub">Assigned live from Betting Shop server</p>

        <div className="winbet-success-details">
          {rows.map((row) => (
            <div key={row.label} className="winbet-success-row">
              <span className="winbet-success-label">{row.label}</span>
              {row.kind === 'badge' ? (
                <span className="winbet-success-badge">{row.value}</span>
              ) : (
                <span
                  className={
                    row.kind === 'gold' ? 'winbet-success-value is-gold' : 'winbet-success-value'
                  }
                >
                  {row.value}
                </span>
              )}
            </div>
          ))}
        </div>

        <button className="winbet-success-btn" type="button" onClick={onContinue}>
          Continue to Platform →
        </button>
      </div>
    </div>
  )
}
