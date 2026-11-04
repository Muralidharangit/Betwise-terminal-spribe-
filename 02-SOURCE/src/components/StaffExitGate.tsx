import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { isTauriApp } from '../lib/storage'
import { friendlyMessage } from '../utils/friendlyMessage'

/**
 * Ctrl+Shift+K → staff password → leave fullscreen kiosk mode.
 * Password comes from config.json AdminPassword (default admin123).
 */
export function StaffExitGate() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isTauriApp()) return

    void invoke('enter_kiosk_mode').catch(() => undefined)

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
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

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!password.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await invoke('exit_kiosk_mode', { password })
      setOpen(false)
      setPassword('')
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      const lower = raw.toLowerCase()
      setError(
        lower.includes('incorrect') || lower.includes('wrong password')
          ? 'Wrong password. Please try again.'
          : friendlyMessage(err, 'Could not leave fullscreen. Please try again.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div className="kx-alert-backdrop winbet-modal-backdrop" style={{ zIndex: 100 }} role="presentation">
      <form
        className="winbet-modal-card animate-pop-in staff-exit-modal"
        onSubmit={(e) => void submit(e)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-exit-title"
        aria-describedby="staff-exit-desc"
      >
        <div className="winbet-modal-badge">
          <span className="modal-badge-num">
            <i className="fa-solid fa-key" aria-hidden="true" />
          </span>
          <span className="modal-badge-title">STAFF</span>
        </div>

        <div className="winbet-modal-icon-glow icon-gold">
          <i className="fa-solid fa-unlock-keyhole modal-icon-symbol" aria-hidden="true" />
        </div>

        <h2 id="staff-exit-title" className="winbet-modal-title title-gold">
          Staff exit
        </h2>
        <p id="staff-exit-desc" className="winbet-modal-desc">
          Enter admin password to leave fullscreen.
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
          <button type="submit" className="btn-winbet-modal-primary" disabled={busy || !password.trim()}>
            {busy ? 'Checking…' : 'Exit terminal'}
          </button>
          <button type="button" className="btn-winbet-modal-secondary" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
