type Props = {
  terminalId?: string
  onRegisterAgain?: () => void
}

export function UnauthorizedScreen({ terminalId, onRegisterAgain }: Props) {
  return (
    <div className="unauth-screen" role="alertdialog" aria-labelledby="unauth-title">
      <div className="unauth-card">
        <div className="unauth-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none">
            <path
              d="M32 5 9 13.5v17.2C9 45.6 18.8 56.3 32 59c13.2-2.7 23-13.4 23-28.3V13.5L32 5Z"
              fill="url(#unauth-shield)"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1.5"
            />
            <rect x="23" y="29" width="18" height="14" rx="3" fill="#fff" />
            <path d="M27 29v-4a5 5 0 0 1 10 0v4" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <circle cx="32" cy="35" r="2" fill="#b91c1c" />
            <path d="M32 36.5v3" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" />
            <defs>
              <linearGradient id="unauth-shield" x1="32" y1="5" x2="32" y2="59" gradientUnits="userSpaceOnUse">
                <stop stopColor="#f87171" />
                <stop offset="1" stopColor="#991b1b" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 id="unauth-title" className="unauth-title">
          Terminal Not Authorized
        </h1>
        <p className="unauth-text">This terminal is not registered or has been unlinked.</p>

        {terminalId ? (
          <div className="unauth-chip">
            <span className="unauth-chip-label">Terminal</span>
            <span className="unauth-chip-value">{terminalId}</span>
          </div>
        ) : null}

        {onRegisterAgain ? (
          <button type="button" className="unauth-btn" onClick={onRegisterAgain}>
            Register again
          </button>
        ) : null}
      </div>
    </div>
  )
}
