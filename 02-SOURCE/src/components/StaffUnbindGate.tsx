import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { fetchHwConfig } from '../lib/hardware'
import { unbindDevHardware } from '../lib/storage'
import { useMachine } from '../services/sessionStore'

const STAFF_PASSWORD_FALLBACK = 'admin123'

type Props = {
  onUnbound: () => void
}

/**
 * Ctrl+Shift+X → staff password → unbind this PC and register again.
 * Clears the saved terminal and issues a fresh hardware ID, so a new token
 * (e.g. a new branch / shop) can be registered without the
 * "already registered" error from the old binding.
 */
export function StaffUnbindGate({ onUnbound }: Props) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expectedPassword, setExpectedPassword] = useState(STAFF_PASSWORD_FALLBACK)

  useEffect(() => {
    void fetchHwConfig()
      .then((cfg) => {
        if (cfg?.AdminPassword) setExpectedPassword(cfg.AdminPassword)
      })
      .catch(() => undefined)

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(true)
        setPassword('')
        setError(null)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!password.trim()) return
    if (password.trim() !== expectedPassword.trim()) {
      setError('Wrong password. Please try again.')
      return
    }
    const balance = useMachine.getState().balance
    if (balance > 0) {
      setError(`Balance ${balance.toFixed(2)} — please cash out before unbinding.`)
      return
    }
    unbindDevHardware()
    setOpen(false)
    setPassword('')
    onUnbound()
  }

  if (!open) return null

  return createPortal(
    <div className="kx-alert-backdrop winbet-modal-backdrop" style={{ zIndex: 100 }} role="presentation">
      <form
        className="winbet-modal-card animate-pop-in staff-exit-modal"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-unbind-title"
        aria-describedby="staff-unbind-desc"
      >
        <div className="winbet-modal-badge">
          <span className="modal-badge-num">
            <i className="fa-solid fa-key" aria-hidden="true" />
          </span>
          <span className="modal-badge-title">STAFF</span>
        </div>

        <div className="winbet-modal-icon-glow icon-gold">
          <i className="fa-solid fa-link-slash modal-icon-symbol" aria-hidden="true" />
        </div>

        <h2 id="staff-unbind-title" className="winbet-modal-title title-gold">
          Unbind &amp; re-register
        </h2>
        <p id="staff-unbind-desc" className="winbet-modal-desc">
          Clears this terminal&apos;s registration so a new token (new branch) can be registered.
        </p>

        <input
          type="password"
          className="winbet-modal-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          autoFocus
          autoComplete="current-password"
          style={{ marginTop: '1rem' }}
        />

        {error ? (
          <p className="error-text" style={{ marginTop: 10, marginBottom: 0 }}>
            {error}
          </p>
        ) : null}

        <div className="winbet-modal-actions" style={{ marginTop: '1.25rem' }}>
          <button type="submit" className="btn-winbet-modal-primary" disabled={!password.trim()}>
            Unbind terminal
          </button>
          <button type="button" className="btn-winbet-modal-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
