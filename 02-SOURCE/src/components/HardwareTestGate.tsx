import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  diagnoseHardware,
  fetchHwConfig,
  onNoteAccepted,
  printTestTicket,
  type DiagnoseCheck,
  type DiagnoseReport,
} from '../lib/hardware'
import { createBarcodeListener } from '../hardware/barcodeBridge'
import { isTauriApp, loadTerminal } from '../lib/storage'
import { useMachine } from '../services/sessionStore'
import { friendlyMessage, PLAIN } from '../utils/friendlyMessage'
import '../styles/hardware-check.css'

const STAFF_PASSWORD_FALLBACK = 'admin123'
const SCAN_WAIT_MS = 15000
const NOTE_WAIT_MS = 25000
const MIN_CHECK_VISIBLE_MS = 1200

type DeviceKey = 'printer' | 'bill' | 'scanner' | 'system'
type DeviceState = 'ready' | 'attention' | 'unknown'
type TestState = { status: 'running' | 'pass' | 'fail'; text: string }

const DEVICE_CHECKS: Record<DeviceKey, string[]> = {
  printer: ['printer_driver', 'printer_device', 'printer_write', 'printer_live'],
  bill: ['bill_model', 'bill_device', 'bill_open'],
  scanner: ['usb_scanner'],
  system: ['groups'],
}

/** Plain-language fix for the first failing check of each device. */
const FIX_TEXT: Record<string, string> = {
  printer_driver:
    'The printer is plugged in, but Windows does not know it yet. Install the printer software from the printer maker (for example Epson or Xprinter), then press Check again.',
  printer_device: 'Printer not found. Check that it is switched on and the USB cable is plugged in, then press Check again.',
  printer_write: 'This terminal is not allowed to use the printer. Please call support.',
  printer_live: 'Printer is not responding. Switch it off and on, then press Check again.',
  bill_model: 'Note reader not found. Check that it has power and the USB cable is plugged in, then press Check again.',
  bill_device: 'Note reader is not plugged in. Connect the USB cable, then press Check again.',
  bill_open: 'This terminal is not allowed to use the note reader. Please call support.',
  usb_scanner: 'Scanner not found. Unplug its USB cable, plug it back in, then press Check again.',
  groups: 'This terminal is not set up to use the printer and note reader yet. Please call support.',
}

const READY_TEXT: Record<DeviceKey, string> = {
  printer: 'Connected and ready to print tickets.',
  bill: 'Connected and ready to accept notes.',
  scanner: 'Connected and ready to read tickets.',
  system: 'The terminal can use the printer and the note reader.',
}

function deviceState(key: DeviceKey, checks: DiagnoseCheck[], isWindows: boolean): DeviceState {
  const mine = checks.filter((c) => DEVICE_CHECKS[key].includes(c.id))
  if (mine.length === 0) return 'unknown'
  // Windows has no way to probe a keyboard-style scanner; only the Scan test proves it.
  if (key === 'scanner' && isWindows) return 'unknown'
  return mine.every((c) => c.ok) ? 'ready' : 'attention'
}

function billModel(checks: DiagnoseCheck[]): string | null {
  const c = checks.find((x) => x.id === 'bill_model')
  if (!c?.ok) return null
  return c.detail.split(' (')[0] || null
}

/** 'N: Name="Barcode Scanner Barcode Scanner"' → "Barcode Scanner" */
function scannerModel(checks: DiagnoseCheck[]): string | null {
  const c = checks.find((x) => x.id === 'usb_scanner')
  if (!c?.ok) return null
  const m = c.detail.match(/Name="([^"]+)"/)
  if (!m) return null
  const words = m[1].trim().split(/\s+/)
  const half = words.length / 2
  if (Number.isInteger(half) && words.slice(0, half).join(' ') === words.slice(half).join(' ')) {
    return words.slice(0, half).join(' ')
  }
  return m[1].trim()
}

/**
 * Ctrl+Shift+D → staff password → machine check (printer, note reader, scanner).
 * Live bill/ticket credit is paused while open.
 */
export function HardwareTestGate() {
  const setInstallTestActive = useMachine((s) => s.setInstallTestActive)
  const machineConfig = useMachine((s) => s.config)
  const [gateOpen, setGateOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [gateError, setGateError] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [expectedPassword, setExpectedPassword] = useState(STAFF_PASSWORD_FALLBACK)
  const [report, setReport] = useState<DiagnoseReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [checkCount, setCheckCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tests, setTests] = useState<Partial<Record<DeviceKey, TestState>>>({})
  const cleanupRef = useRef<Array<() => void>>([])

  useEffect(() => {
    if (!isTauriApp()) return
    void fetchHwConfig().then((cfg) => {
      if (cfg?.AdminPassword) setExpectedPassword(cfg.AdminPassword)
    })
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault()
        e.stopPropagation()
        setGateOpen(true)
        setPassword('')
        setShowPassword(false)
        setGateError(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  useEffect(() => {
    if (!gateOpen && !unlocked) return
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAll()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateOpen, unlocked])

  useEffect(() => {
    setInstallTestActive(unlocked)
    return () => setInstallTestActive(false)
  }, [unlocked, setInstallTestActive])

  useEffect(() => {
    if (!unlocked) return
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked])

  useEffect(() => () => stopListeners(), [])

  function stopListeners() {
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []
  }

  function setTest(key: DeviceKey, next: TestState | null) {
    setTests((prev) => {
      const copy = { ...prev }
      if (next) copy[key] = next
      else delete copy[key]
      return copy
    })
  }

  async function refresh() {
    if (!isTauriApp()) {
      setLoadError('The machine check only works inside the terminal app.')
      return
    }
    setBusy(true)
    setLoadError(null)
    // Old test results (print / scan / note) belong to the previous check — clear them.
    stopListeners()
    setTests({})
    const startedAt = Date.now()
    try {
      const next = await diagnoseHardware()
      // The check is often done in < 0.5 s. Keep the "Checking devices…" state on screen
      // long enough for staff to see that something happened.
      const remaining = MIN_CHECK_VISIBLE_MS - (Date.now() - startedAt)
      if (remaining > 0) await new Promise((r) => window.setTimeout(r, remaining))
      setReport(next)
      setCheckedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setCheckCount((n) => n + 1)
    } catch (err) {
      setLoadError(
        friendlyMessage(err, 'The machine check could not run. Close this window and try again, or call support.'),
      )
    } finally {
      setBusy(false)
    }
  }

  function closeAll() {
    stopListeners()
    setUnlocked(false)
    setGateOpen(false)
    setPassword('')
    setTests({})
    setInstallTestActive(false)
  }

  function submitGate(e: FormEvent) {
    e.preventDefault()
    if (password.trim() === expectedPassword.trim()) {
      setUnlocked(true)
      setGateOpen(false)
      setPassword('')
      setGateError(null)
      return
    }
    setGateError('Wrong password. Please try again.')
    setShakeKey((k) => k + 1)
    setPassword('')
  }

  async function runPrint() {
    setTest('printer', { status: 'running', text: 'Printing a test ticket…' })
    try {
      await printTestTicket()
      setTest('printer', { status: 'pass', text: 'Test ticket sent. Check that the paper came out.' })
    } catch (err) {
      setTest('printer', {
        status: 'fail',
        text: friendlyMessage(err, PLAIN.printerNotResponding),
      })
    }
  }

  function runScan() {
    setTest('scanner', { status: 'running', text: 'Scan any barcode now…' })
    const stop = createBarcodeListener((code) => {
      cleanup()
      setTest('scanner', { status: 'pass', text: `Scanner works. Read: ${code}` })
    })
    const timer = window.setTimeout(() => {
      cleanup()
      setTest('scanner', {
        status: 'fail',
        text: 'Nothing was scanned in 15 seconds. Tap the screen once, then try again.',
      })
    }, SCAN_WAIT_MS)
    function cleanup() {
      stop()
      window.clearTimeout(timer)
    }
    cleanupRef.current.push(cleanup)
  }

  function runBill() {
    if (!isTauriApp()) return
    setTest('bill', { status: 'running', text: 'Insert one note now. It will not be added to the balance.' })
    let unlisten: (() => void) | undefined
    const timer = window.setTimeout(() => {
      unlisten?.()
      setTest('bill', {
        status: 'fail',
        text: 'No note was read in 25 seconds. Check the note reader power and cable.',
      })
    }, NOTE_WAIT_MS)
    cleanupRef.current.push(() => {
      window.clearTimeout(timer)
      unlisten?.()
    })
    void onNoteAccepted((payload) => {
      window.clearTimeout(timer)
      unlisten?.()
      setTest('bill', {
        status: 'pass',
        text: `Note reader works. Read ${payload.currency} ${payload.amount} (not added to balance).`,
      })
    }).then((u) => {
      unlisten = u
    })
  }

  if (gateOpen && !unlocked) {
    return createPortal(
      <div className="hwx-backdrop" role="dialog" aria-modal="true" aria-labelledby="hwx-gate-title">
        <form key={shakeKey} className={`hwx-gate ${gateError ? 'is-error' : ''}`} onSubmit={submitGate}>
          <button
            type="button"
            className="hwx-gate-close"
            onClick={() => setGateOpen(false)}
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark" />
          </button>
          <div className="hwx-gate-orb">
            <i className="fa-solid fa-shield-halved" />
          </div>
          <div className="hwx-eyebrow">Staff only</div>
          <h2 id="hwx-gate-title" className="hwx-gate-title">Terminal Check</h2>
          <p className="hwx-gate-text">
            Enter the staff password to check the printer, note reader and scanner.
          </p>

          <label className="hwx-field">
            <i className="fa-solid fa-lock hwx-field-icon" />
          <input
              type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
              placeholder="Staff password"
            autoFocus
            autoComplete="current-password"
              aria-invalid={Boolean(gateError)}
            />
            <button
              type="button"
              className="hwx-field-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </label>
          <p className="hwx-gate-error" role="alert">
            {gateError ? (
              <>
                <i className="fa-solid fa-circle-exclamation" /> {gateError}
              </>
            ) : null}
          </p>

          <button type="submit" className="hwx-btn hwx-btn-primary" disabled={!password.trim()}>
            <i className="fa-solid fa-unlock-keyhole" /> Unlock
          </button>
          <button type="button" className="hwx-btn hwx-btn-ghost" onClick={() => setGateOpen(false)}>
              Cancel
            </button>
          <p className="hwx-gate-foot">
            <i className="fa-solid fa-pause" /> Cash-in and ticket scanning pause while the check is open.
          </p>
        </form>
      </div>,
      document.body,
    )
  }

  if (!unlocked) return null

  const checks = report?.checks ?? []
  const terminalId = loadTerminal()?.pcName || machineConfig?.PC_Name || machineConfig?.Terminal_ID || ''
  const isWindows = (report?.os ?? '').toLowerCase().startsWith('windows')
  const devices: Array<{
    key: DeviceKey
    name: string
    icon: string
    model: string
    testLabel?: string
    testIcon?: string
    onTest?: () => void
  }> = [
    {
      key: 'printer',
      name: 'Ticket printer',
      icon: 'fa-print',
      model: report?.printer_model || 'Receipt printer',
      testLabel: 'Print test ticket',
      testIcon: 'fa-print',
      onTest: () => void runPrint(),
    },
    {
      key: 'bill',
      name: 'Note reader',
      icon: 'fa-money-bill-wave',
      model: billModel(checks) ?? 'Bill acceptor',
      testLabel: 'Test with a note',
      testIcon: 'fa-money-bill-transfer',
      onTest: runBill,
    },
    {
      key: 'scanner',
      name: 'Barcode scanner',
      icon: 'fa-barcode',
      model: scannerModel(checks) ?? 'Ticket scanner',
      testLabel: 'Test scanner',
      testIcon: 'fa-qrcode',
      onTest: runScan,
    },
    {
      key: 'system',
      name: 'System access',
      icon: isWindows ? 'fa-brands fa-windows' : 'fa-brands fa-linux',
      model: isWindows ? 'Windows' : 'Linux',
    },
  ]

  const rows = devices.map((d) => {
    const test = tests[d.key]
    let state = report ? deviceState(d.key, checks, isWindows) : 'unknown'
    if (test?.status === 'pass') state = 'ready'
    const firstFail = checks.find((c) => DEVICE_CHECKS[d.key].includes(c.id) && !c.ok)
    const message =
      state === 'ready'
        ? isWindows && d.key === 'system'
          ? 'Windows — no extra setup needed.'
          : READY_TEXT[d.key]
        : state === 'attention'
          ? FIX_TEXT[firstFail?.id ?? ''] ?? 'Needs attention. Press Check again.'
          : d.key === 'scanner'
            ? 'Press Test scanner and scan any barcode to confirm.'
            : 'Not checked yet.'
    return { ...d, state, message, test }
  })

  const attention = rows.filter((r) => r.state === 'attention')
  const checkedNote = checkedAt
    ? ` Checked at ${checkedAt}${checkCount > 1 ? ` (check ${checkCount}).` : '.'}`
    : ''
  const summary = busy
    ? {
        tone: 'checking',
        icon: 'fa-spinner fa-spin',
        title: report ? 'Checking devices again…' : 'Checking devices…',
        text: 'Looking for the printer, note reader and scanner. This takes a few seconds.',
      }
    : attention.length === 0
      ? {
          tone: 'ok',
          icon: 'fa-circle-check',
          title: 'All devices are ready',
          text: `This terminal can take cash, read tickets and print cash-out tickets.${checkedNote}`,
        }
      : {
          tone: 'bad',
          icon: 'fa-triangle-exclamation',
          title: `${attention.length} ${attention.length === 1 ? 'device needs' : 'devices need'} attention`,
          text: `${attention.map((r) => r.name).join(', ')}.${checkedNote}`,
        }

  const stateLabel: Record<DeviceState, string> = {
    ready: 'Ready',
    attention: 'Needs attention',
    unknown: 'Not checked',
  }

  return createPortal(
    <div className="hwx-backdrop" role="dialog" aria-modal="true" aria-labelledby="hwx-diag-title">
      <div className={`hwx-diag${busy ? ' is-busy' : ''}`} aria-busy={busy}>
        <header className="hwx-head">
          <div className="hwx-head-icon">
            <i className="fa-solid fa-screwdriver-wrench" />
          </div>
          <div className="hwx-head-text">
            <div className="hwx-eyebrow">Staff only</div>
            <h2 id="hwx-diag-title" className="hwx-head-title">Terminal Check</h2>
            <div className="hwx-chips">
              {terminalId ? (
                <span className="hwx-chip">
                  <i className="fa-solid fa-desktop" /> {terminalId}
                </span>
              ) : null}
              {report ? (
                <span className="hwx-chip">
                  <i className={isWindows ? 'fa-brands fa-windows' : 'fa-brands fa-linux'} /> {report.os}
                </span>
              ) : null}
            </div>
          </div>
          <button type="button" className="hwx-close" onClick={closeAll} aria-label="Close machine check">
            <i className="fa-solid fa-xmark" />
          </button>
        </header>

        <div className="hwx-body">
          {loadError ? (
            <div className="hwx-summary is-bad">
              <i className="fa-solid fa-triangle-exclamation" />
              <div>
                <strong>Could not run the check</strong>
                <span>{loadError}</span>
          </div>
            </div>
          ) : (
            <div className={`hwx-summary is-${summary.tone}`}>
              <i className={`fa-solid ${summary.icon}`} />
              <div>
                <strong>{summary.title}</strong>
                <span>{summary.text}</span>
          </div>
        </div>
          )}

          <div className="hwx-grid">
            {rows.map((r) => (
              <section key={r.key} className={`hwx-card is-${r.state}`}>
                <div className="hwx-card-top">
                  <div className="hwx-card-icon">
                    <i className={r.icon.startsWith('fa-brands') ? r.icon : `fa-solid ${r.icon}`} />
                  </div>
                  <div className="hwx-card-name">
                    <strong>{r.name}</strong>
                    <span>{r.model}</span>
                  </div>
                  <span className={`hwx-pill is-${r.state}`}>
                    <i
                      className={`fa-solid ${
                        r.state === 'ready'
                          ? 'fa-check'
                          : r.state === 'attention'
                            ? 'fa-exclamation'
                            : 'fa-minus'
                      }`}
                    />
                    {stateLabel[r.state]}
                  </span>
        </div>
                <p className="hwx-card-msg">{r.message}</p>

                {r.test ? (
                  <div className={`hwx-test is-${r.test.status}`}>
                    <i
                      className={`fa-solid ${
                        r.test.status === 'running'
                          ? 'fa-spinner fa-spin'
                          : r.test.status === 'pass'
                            ? 'fa-circle-check'
                            : 'fa-circle-xmark'
                      }`}
                    />
                    <span>{r.test.text}</span>
          </div>
        ) : null}

                {r.onTest ? (
                  <button
                    type="button"
                    className="hwx-card-btn"
                    disabled={busy || r.test?.status === 'running'}
                    onClick={r.onTest}
                  >
                    <i className={`fa-solid ${r.testIcon}`} /> {r.testLabel}
                  </button>
                ) : (
                  <div className="hwx-card-btn is-static">
                    <i className="fa-solid fa-shield-halved" /> Verified
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>

        <footer className="hwx-foot">
          <span className="hwx-foot-note">
            <i className="fa-solid fa-pause" /> Cash-in and ticket scanning are paused while this screen is open.
          </span>
          <div className="hwx-foot-actions">
            <button type="button" className="hwx-btn hwx-btn-ghost" disabled={busy} onClick={() => void refresh()}>
              <i className={`fa-solid fa-arrows-rotate ${busy ? 'fa-spin' : ''}`} /> {busy ? 'Checking…' : 'Check again'}
            </button>
            <button type="button" className="hwx-btn hwx-btn-primary" onClick={closeAll}>
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
