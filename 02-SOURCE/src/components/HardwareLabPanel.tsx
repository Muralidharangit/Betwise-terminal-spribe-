import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { isHardwareSimulatorEnabled } from '../config/env'
import { downloadDemoTicket, type DemoTicket } from '../lib/demoTicket'
import { formatCurrency } from '../api/client'

const NOTES = [10, 20, 50, 100, 200]
const LAB_PASSWORD = 'admin123'

type Props = {
  balance: number
  currencySymbol: string
  kioskName: string
  adminPassword?: string
  onBillIn: (amount: number) => Promise<boolean>
  onTicketIn: (barcode: string) => Promise<boolean>
  onCashOut: (simulatePrintFail: boolean) => Promise<DemoTicket | null>
}

export function HardwareLabPanel({
  balance,
  currencySymbol,
  kioskName,
  adminPassword = LAB_PASSWORD,
  onBillIn,
  onTicketIn,
  onCashOut,
}: Props) {
  const enabled = isHardwareSimulatorEnabled()
  const [gateOpen, setGateOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(true) // default unlocked for hub bar convenience
  const [collapsed, setCollapsed] = useState(false)
  const [password, setPassword] = useState('')
  const [gateError, setGateError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [barcode, setBarcode] = useState('')
  const [printFail, setPrintFail] = useState(false)
  const [history, setHistory] = useState<DemoTicket[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const labKey = e.key === 'H' || e.key === 'h' || e.key === 'L' || e.key === 'l'
      if (!(e.ctrlKey && e.shiftKey && labKey)) return
      e.preventDefault()
      e.stopPropagation()
      if (!unlocked) {
        setGateOpen(true)
      } else {
        setDrawerOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [unlocked])

  if (!enabled) return null

  function submitGate(e: FormEvent) {
    e.preventDefault()
    if (password.trim() === adminPassword.trim()) {
      setUnlocked(true)
      setGateOpen(false)
      setPassword('')
      setGateError(null)
      return
    }
    setGateError('Wrong password')
  }

  async function run(label: string, work: () => Promise<boolean | DemoTicket | null>) {
    if (busy) return
    setBusy(true)
    setStatus(null)
    try {
      const result = await work()
      if (result === false) {
        setStatus('Failed — see the terminal alert')
      } else if (result && typeof result === 'object' && result.barcode) {
        setHistory((prev) => [result, ...prev.filter((t) => t.barcode !== result.barcode)].slice(0, 8))
        setStatus(`Ticket ${result.barcode}`)
      } else if (printFail && result == null) {
        setStatus('Print fail — see terminal alert')
      } else {
        setStatus(label)
      }
    } finally {
      setBusy(false)
    }
  }

  async function billIn(amount: number) {
    await run(`Cash in ${currencySymbol}${amount}`, () => onBillIn(amount))
  }

  return (
    <>
      {gateOpen
        ? createPortal(
            <div className="kx-alert-backdrop winbet-modal-backdrop" style={{ zIndex: 110 }}>
              <form className="winbet-modal-card icon-gold" onSubmit={submitGate}>
                <div className="winbet-modal-badge">
                  <span className="modal-badge-num">00</span>
                  <span className="modal-badge-title">Staff Security</span>
                </div>
                <div className="winbet-modal-icon-glow icon-gold">
                  <span className="modal-icon-symbol">🔑</span>
                </div>
                <h2 className="winbet-modal-title title-gold">Hardware Control</h2>
                <p className="winbet-modal-desc">Enter admin password to open extended diagnostics.</p>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Admin password"
                  autoFocus
                  autoComplete="current-password"
                  className="winbet-modal-input"
                />
                {gateError ? <p className="winbet-error-msg">{gateError}</p> : null}
                <div className="winbet-modal-actions" style={{ marginTop: 20 }}>
                  <button type="submit" className="btn-winbet-modal-primary" disabled={!password.trim()}>
                    Unlock
                  </button>
                  <button type="button" className="btn-winbet-modal-secondary" onClick={() => setGateOpen(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}

      {/* WINBET Hardware Hub Bottom Bar (as in Screenshots 1 & 2) */}
      <footer className={`winbet-hardware-hub-bar${collapsed ? ' is-collapsed' : ''}`}>
        <div className="hw-hub-left">
          <span className="hw-badge hw-badge-brand">
            <span className="badge-icon">🏷️</span> HARDWARE HUB
          </span>
          <span className="hw-badge hw-badge-green">
            <span className="badge-icon">💵</span> Bill In: Active
          </span>
          <span className="hw-badge hw-badge-cyan">
            <span className="badge-icon">🎫</span> Scanner: Auto-Wedge
          </span>
          <span className="hw-badge hw-badge-gold">
            <span className="badge-icon">💰</span> Float: 170
          </span>
          <span className="hw-badge hw-badge-green">
            <span className="badge-icon">🖨️</span> Printer: Online
          </span>
          <button
            type="button"
            className="hw-badge hw-badge-gold hw-btn-link"
            onClick={() => setGateOpen(true)}
          >
            <span className="badge-icon">🔑</span> In-Key Check
          </button>
          <button
            type="button"
            className="hw-badge hw-badge-muted hw-btn-link"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? '⌃ Show' : '⌄ Hide'}
          </button>
        </div>

        {!collapsed ? (
          <div className="hw-hub-right">
            <span className="hw-bill-title">
              <span className="badge-icon">💵</span> Bill Acceptor:
            </span>
            <div className="hw-bill-quick-row">
              {NOTES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="hw-quick-bill-btn"
                  disabled={busy}
                  onClick={() => void billIn(n)}
                >
                  +{currencySymbol} {n}
                </button>
              ))}
            </div>

            <form
              className="hw-quick-insert-form"
              onSubmit={(e) => {
                e.preventDefault()
                const amount = Number(customAmount)
                if (!Number.isFinite(amount) || amount < 1) return
                void billIn(amount)
                setCustomAmount('')
              }}
            >
              <input
                type="number"
                min={1}
                step="1"
                placeholder=""
                className="hw-quick-input"
                value={customAmount}
                disabled={busy}
                onChange={(e) => setCustomAmount(e.target.value)}
              />
              <button type="submit" className="hw-quick-insert-btn" disabled={busy || !customAmount}>
                Insert
              </button>
            </form>
          </div>
        ) : null}
      </footer>

      {/* Advanced Diagnostics Slideout Drawer (when opened with Ctrl+Shift+L) */}
      {drawerOpen ? (
        <aside className="hw-lab-dock winbet-drawer-panel" aria-label="Hardware Lab">
          <header className="hw-lab-head">
            <div>
              <strong>Hardware Diagnostics</strong>
              <span>{kioskName}</span>
            </div>
            <button type="button" className="hw-lab-hide" onClick={() => setDrawerOpen(false)}>
              ✕
            </button>
          </header>

          <p className="hw-lab-balance">
            Balance: <strong style={{ color: 'var(--vegas-gold)' }}>{formatCurrency(balance)}</strong>
          </p>

          <p className="hw-lab-label">Simulate Ticket Scan</p>
          <form
            className="ticket-scan-form"
            onSubmit={(e) => {
              e.preventDefault()
              const code = barcode.trim().toUpperCase()
              if (!code) return
              void run(`Ticket in ${code}`, () => onTicketIn(code))
            }}
          >
            <input
              value={barcode}
              disabled={busy}
              placeholder="Paste ticket barcode"
              autoCapitalize="characters"
              onChange={(e) => setBarcode(e.target.value)}
            />
            <button type="submit" className="btn-winbet-modal-primary" style={{ padding: '8px 16px' }} disabled={busy || !barcode.trim()}>
              Scan
            </button>
          </form>

          <p className="hw-lab-label" style={{ marginTop: 16 }}>Simulate Printer Failures</p>
          <label className="hw-lab-check">
            <input
              type="checkbox"
              checked={printFail}
              disabled={busy}
              onChange={(e) => setPrintFail(e.target.checked)}
            />
            Simulate print fail on cash-out
          </label>
          <button
            type="button"
            className="btn-winbet btn-print-ticket"
            style={{ width: '100%', marginTop: 8 }}
            disabled={busy || balance <= 0}
            onClick={() => void run('Cash out', () => onCashOut(printFail))}
          >
            {printFail ? 'Simulate Print Error' : 'Test Cash Out'}
          </button>

          {history.length > 0 ? (
            <ul className="hw-lab-tickets">
              {history.map((ticket) => (
                <li key={ticket.barcode}>
                  <code>{ticket.barcode}</code>
                  <span>
                    {ticket.currencySymbol}
                    {ticket.amount.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(ticket.barcode)}
                  >
                    Copy
                  </button>
                  <button type="button" onClick={() => downloadDemoTicket(ticket)}>
                    File
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {status ? <p className="hw-lab-status">{status}</p> : null}
        </aside>
      ) : null}
    </>
  )
}

