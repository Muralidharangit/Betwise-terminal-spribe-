import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import {
  billIn,
  cancelCashOutTicket,
  cashOutTicket,
  fetchSession,
  isHardwareUnauthorized,
  sendHeartbeat,
  ticketIn,
} from '../api/client'
import ArenaShell from '../components/ArenaShell'
import { CashOutConfirmModal } from '../components/CashOutConfirmModal'
// import { HardwareLabPanel } from '../components/HardwareLabPanel'
import KioskAlert, { TicketChecking } from '../components/KioskAlert'
import { RequireCredit } from '../components/RequireCredit'
import StatusToast from '../components/StatusToast'
import { isHardwareSimulatorEnabled } from '../config/env'
import { downloadDemoTicket } from '../lib/demoTicket'
import { createBarcodeListener } from '../hardware/barcodeBridge'
import { uiLog } from '../lib/uiLog'
import { blockTapsBriefly } from '../lib/tapGuard'
import {
  fetchHardwareStatus,
  fetchHwConfig,
  isTauriApp,
  onHardwareError,
  onNoteAccepted,
  onNoteReading,
  onNoteRejected,
  printCashOutTicket,
  setShopAvailableCoins,
  startHardware,
  reconnectMissingHardware,
} from '../lib/hardware'
import { getLiveHardwareId, type StoredTerminal } from '../lib/storage'
import { useTerminalRealtime } from '../lib/useTerminalRealtime'
import { useMachine } from '../services/sessionStore'
import { useShallow } from 'zustand/react/shallow'
import { deviceLabel, friendlyMessage, PLAIN } from '../utils/friendlyMessage'
import CashInsertedScreen from './CashInsertedScreen'
import CashOutScreen from './CashOutScreen'
import GamesLobby from './GamesLobby'
import HomeScreen from './HomeScreen'
import LuckyWheelGame from './games/LuckyWheelGame'
import AviatorGame from './games/AviatorGame'
import { UnauthorizedScreen } from './UnauthorizedScreen'

type Props = {
  terminal: StoredTerminal
  onUnauthorized: () => void
  onRegisterToken?: () => void
}

/** How often we ask the server for shop float (available coins). Keep short so a top-up is picked up quickly. */
const HEARTBEAT_MS = 15000
/** Session poll: a Back Office credit load must show within seconds even if the realtime push is missed. */
const BALANCE_POLL_MS = 5000
const TICKET_CHECK_TIMEOUT_MS = 20000
const NOTE_CHECK_MAX_MS = 20000
/** Printer state is shown on the Cash Out button, so a power switch must show within seconds. */
const HARDWARE_POLL_MS = 2000
/** Retry a printer that is missing; re-detecting it is cheap. */
const PRINTER_RECONNECT_MS = 3000
/** A missing note reader means scanning serial ports, so retry it less often. */
const HARDWARE_RECONNECT_MS = 15000

function ticketErrorTitle(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('shop balance')) return 'Shop balance too low'
  if (
    m.includes('redeemed') ||
    m.includes('cancelled') ||
    m.includes('canceled') ||
    m.includes('void') ||
    m.includes('already been paid') ||
    m.includes('already used')
  ) {
    return 'Ticket already redeemed'
  }
  if (m.includes('could not find')) return 'Ticket not found'
  if (m.includes('not a cash-out ticket')) return 'Wrong ticket'
  if (m.includes('cannot reach the server') || m.includes('connection is slow')) return 'Connection problem'
  if (m.includes('scanner')) return 'Scanner problem'
  return 'Ticket not accepted'
}

export function ArenaApp({ terminal, onUnauthorized, onRegisterToken }: Props) {
  const navigate = useNavigate()
  const { setConfig, setMachineId, setBalance, showAlert, clearAlert, setLastCash, setLastTicket, setCreditSource, setPrinterWarning, setShowInsertMoneyModal, balance, config, alert } = useMachine(
    useShallow((s) => ({
      setConfig: s.setConfig,
      setMachineId: s.setMachineId,
      setBalance: s.setBalance,
      showAlert: s.showAlert,
      clearAlert: s.clearAlert,
      setLastCash: s.setLastCash,
      setLastTicket: s.setLastTicket,
      setCreditSource: s.setCreditSource,
      setPrinterWarning: s.setPrinterWarning,
      setShowInsertMoneyModal: s.setShowInsertMoneyModal,
      balance: s.balance,
      config: s.config,
      alert: s.alert,
    })),
  )
  const [ready, setReady] = useState(false)
  const [machineDbId, setMachineDbId] = useState<number | undefined>()
  const [playerId, setPlayerId] = useState<number | null>(null)
  const [hardwareBlocked, setHardwareBlocked] = useState(false)
  const [printerReady, setPrinterReady] = useState(false)
  /** Ignore a second bill-in for the same note (StrictMode double listener / GBA escrow+stack). */
  const lastBillInAt = useRef(0)
  const lastBillInAmount = useRef<number | null>(null)
  /** Note sent to the server; the realtime balance push may arrive before the HTTP reply. */
  const pendingNote = useRef<{ amount: number; previousBal: number; shown: boolean } | null>(null)
  const redeemBusy = useRef(false)
  const [checkingTicket, setCheckingTicket] = useState(false)
  /** Note amount while the reader stacks it and the server adds it (null = idle). */
  const [noteInProgress, setNoteInProgress] = useState<number | null>(null)
  const [cashInOpen, setCashInOpen] = useState(false)
  const closeCashIn = useCallback(() => {
    blockTapsBriefly()
    setCashInOpen(false)
    const path = window.location.hash.replace(/^#/, '') || '/'
    if (path !== '/home' && path !== '/play') navigate('/play')
  }, [navigate])
  const [showCashOutConfirm, setShowCashOutConfirm] = useState(false)
  const [cashOutBusy, setCashOutBusy] = useState(false)
  /** The server shows 0 while a ticket prints; a session poll must not overwrite a restored balance. */
  const cashOutInFlight = useRef(false)

  // Confirm Cash Out shows the amount at the moment it opened; a new message or
  // a balance change (note, ticket, cashier load) makes it out of date.
  useEffect(() => {
    if (alert) setShowCashOutConfirm(false)
  }, [alert])
  useEffect(() => {
    setShowCashOutConfirm(false)
  }, [balance])
  // Printer switched off while Confirm Cash Out is open: say so now, not after Confirm.
  useEffect(() => {
    if (!showCashOutConfirm || printerReady || isHardwareSimulatorEnabled()) return
    setShowCashOutConfirm(false)
    showPrinterAlert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCashOutConfirm, printerReady])

  useEffect(() => {
    setMachineId(terminal.machineId)
    setPrinterWarning(null)
    setConfig({
      API_URL: '',
      Terminal_ID: terminal.pcName || terminal.hostname || terminal.machineId,
      Printer_Name: 'EPSON TM-T88V',
      BillAcceptor_Port: '/dev/ttyUSB0',
      CoinAcceptor_Port: '',
      AdminPassword: 'admin123',
      Currency: 'NAD',
      CurrencySymbol: 'N$',
      SessionTimeoutSeconds: 120,
      DepositRetryIntervalMs: 5000,
      DepositMaxRetries: 12,
      KioskLockdown: false,
    })
  }, [terminal, setConfig, setMachineId, setPrinterWarning])

  // Connect real bill acceptor + printer from config.json
  useEffect(() => {
    let cancelled = false
    async function bootHw() {
      try {
        const hwCfg = await fetchHwConfig()
        if (hwCfg && !cancelled) {
          setConfig({
            API_URL: hwCfg.API_URL || '',
            Terminal_ID: terminal.pcName || terminal.hostname || terminal.machineId,
            Printer_Name: hwCfg.Printer_Name,
            BillAcceptor_Port: hwCfg.BillAcceptor_Port,
            CoinAcceptor_Port: hwCfg.CoinAcceptor_Port,
            AdminPassword: 'admin123',
            Currency: hwCfg.Currency || 'NAD',
            CurrencySymbol: hwCfg.CurrencySymbol || 'N$',
            SessionTimeoutSeconds: 120,
            DepositRetryIntervalMs: 5000,
            DepositMaxRetries: 12,
            KioskLockdown: false,
          })
        }
        const status = await startHardware()
        if (status && !cancelled) {
          setPrinterReady(!!status.printer.connected)
          console.info('Hardware:', status.bill.detail, '|', status.printer.detail)
        }
      } catch (err) {
        console.warn('Hardware start failed', err)
        if (!cancelled) setPrinterReady(false)
      }
    }
    void bootHw()

    let lastReconnectAt = 0
    const poll = window.setInterval(() => {
      void fetchHardwareStatus()
        .then(async (status) => {
          if (cancelled || !status) return
          setPrinterReady(!!status.printer.connected)
          const missing = !status.bill.connected || !status.printer.connected
          const retryMs = status.bill.connected ? PRINTER_RECONNECT_MS : HARDWARE_RECONNECT_MS
          if (!missing || Date.now() - lastReconnectAt < retryMs) return
          lastReconnectAt = Date.now()
          const after = await reconnectMissingHardware()
          if (cancelled || !after) return
          setPrinterReady(!!after.printer.connected)
          if (after.bill.connected !== status.bill.connected || after.printer.connected !== status.printer.connected) {
            uiLog(`hardware_reconnected bill=${after.bill.connected} printer=${after.printer.connected}`)
          }
        })
        .catch(() => {
          if (!cancelled) setPrinterReady(false)
        })
    }, HARDWARE_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [terminal, setConfig])

  useEffect(() => {
    let cancelled = false

    async function sync() {
      try {
        const hardwareId = await getLiveHardwareId()
        const session = await fetchSession(terminal.machineId, hardwareId)
        if (cancelled) return
        setMachineDbId(session.id)
        setPlayerId(session.player_id ?? null)
        setBalance(session.current_balance)
        if (session.available_coins != null) {
          void setShopAvailableCoins(session.available_coins)
        }
        setHardwareBlocked(false)
        setReady(true)
      } catch (err) {
        if (cancelled) return
        if (isHardwareUnauthorized(err)) {
          setHardwareBlocked(true)
          return
        }
        setReady(true)
      }
    }

    void sync()
    return () => {
      cancelled = true
    }
  }, [terminal.machineId, setBalance])

  useTerminalRealtime(
    machineDbId,
    terminal.machineId,
    {
      onConnected: () => undefined,
      onApproved: (payload) => {
        const next = Number(payload.current_balance)
        setBalance(Number.isFinite(next) ? next : 0)
      },
      onRejected: () => undefined,
      onLoadSuccess: (payload) => {
        const next = Number(payload.current_balance)
        if (Number.isFinite(next) && finishNoteFromPush(next)) {
          setBalance(next)
        } else if (Number.isFinite(next)) {
          const currentBal = useMachine.getState().balance
          const diff = next - currentBal
          if (diff > 0) {
            useMachine.getState().setLastCash(diff)
            useMachine.getState().setCreditSource('cash')
          }
          setBalance(next)
        }
        void getLiveHardwareId()
          .then((hardwareId) => fetchSession(terminal.machineId, hardwareId))
          .then((session) => {
            setPlayerId(session.player_id ?? null)
          })
          .catch(() => undefined)
      },
      onPlayerBalance: (chips) => {
        setBalance(chips)
        finishNoteFromPush(chips)
      },
    },
    playerId,
  )

  useEffect(() => {
    async function heartbeat() {
      try {
        const hardwareId = await getLiveHardwareId()
        const beat = await sendHeartbeat(terminal.machineId, hardwareId, 'ONLINE')
        if (beat?.available_coins != null) {
          void setShopAvailableCoins(beat.available_coins)
        }
      } catch (err) {
        if (isHardwareUnauthorized(err)) setHardwareBlocked(true)
      }
    }
    void heartbeat()
    const timer = window.setInterval(() => void heartbeat(), HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [terminal.machineId])

  useEffect(() => {
    let cancelled = false
    let polling = false

    async function pollBalance() {
      if (polling) return
      polling = true
      try {
        const hardwareId = await getLiveHardwareId()
        const session = await fetchSession(terminal.machineId, hardwareId)
        if (cancelled || cashOutInFlight.current) return
        if (Number.isFinite(session.current_balance)) {
          setBalance(session.current_balance)
        }
        if (session.player_id != null) {
          setPlayerId(session.player_id)
        }
      } catch (err) {
        if (!cancelled && isHardwareUnauthorized(err)) setHardwareBlocked(true)
      } finally {
        polling = false
      }
    }

    const timer = window.setInterval(() => void pollBalance(), BALANCE_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [terminal.machineId, setBalance])

  useEffect(() => {
    if (noteInProgress == null) return
    const timer = window.setTimeout(() => setNoteInProgress(null), NOTE_CHECK_MAX_MS)
    return () => window.clearTimeout(timer)
  }, [noteInProgress])

  // Real bill acceptor events from Rust
  useEffect(() => {
    let cancelled = false
    const unsubs: Array<() => void> = []

    function keepUnlisten(unlisten: () => void) {
      if (cancelled) {
        unlisten()
        return
      }
      unsubs.push(unlisten)
    }

    void onNoteReading((payload) => {
      if (useMachine.getState().installTestActive) return
      setNoteInProgress(payload.amount)
    }).then(keepUnlisten)
    void onNoteAccepted((payload) => {
      void acceptCash(payload.amount)
    }).then(keepUnlisten)
    void onNoteRejected((payload) => {
      setNoteInProgress(null)
      if (useMachine.getState().installTestActive) return
      const reason = payload.reason || ''
      const shopTooLow = reason === 'shop_balance_too_low'
      // Float was just topped up in Back Office? Pull the new amount now — do not wait for the next heartbeat.
      if (shopTooLow) {
        void getLiveHardwareId()
          .then((hardwareId) =>
            Promise.all([
              fetchSession(terminal.machineId, hardwareId),
              sendHeartbeat(terminal.machineId, hardwareId, 'ONLINE'),
            ]),
          )
          .then(([session, beat]) => {
            const coins = beat.available_coins ?? session.available_coins
            if (coins != null) void setShopAvailableCoins(coins)
          })
          .catch(() => undefined)
      }
      const message = shopTooLow
        ? 'Shop coins available is too low for this note. If you just topped up the float, wait a few seconds and insert the note again.'
        : reason.startsWith('code_2')
          ? 'This note was not recognised. Use a clean NAD 10 / 20 / 50 / 100 / 200 note.'
          : reason.startsWith('code_3')
            ? 'Note was rejected in the feeder. Insert flat, follow the arrow, and release.'
            : reason.startsWith('code_4') || reason.startsWith('code_5')
              ? 'This note type is not accepted on this terminal.'
              : 'Note rejected. Please try another NAD bill.'
      showAlert({
        tone: shopTooLow ? 'error' : 'warn',
        title: shopTooLow ? 'Shop balance too low' : 'Cash not accepted',
        message,
        autoCloseMs: 0,
      })
    }).then(keepUnlisten)
    void onHardwareError((payload) => {
      if (payload.device === 'bill') setNoteInProgress(null)
      const err = (payload.error || '').toLowerCase()
      // Ignore missing serial/printer paths on lab machines (no cabinet attached).
      if (
        err.includes('no such file') ||
        err.includes('not found') ||
        err.includes('enoent')
      ) {
        console.warn('Hardware offline (expected without cabinet):', payload)
        return
      }
      const label = deviceLabel(payload.device)
      showAlert({
        tone: 'error',
        title: label === 'note reader' ? 'Note reader problem' : label === 'ticket printer' ? 'Printer problem' : 'Terminal problem',
        message: friendlyMessage(
          payload.error,
          `The ${label} needs attention. Please call the cashier.`,
        ),
        autoCloseMs: 0,
      })
    }).then(keepUnlisten)
    return () => {
      cancelled = true
      unsubs.forEach((u) => u())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal.machineId])

  useEffect(() => {
    return createBarcodeListener(
      (code) => {
        void redeemTicket(code)
      },
      {
        onWakeMiss: () => {
          showAlert({
            tone: 'warn',
            title: 'Scan again',
            message: 'Scanner is waking up — please scan the ticket once more.',
            autoCloseMs: 3500,
          })
        },
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal.machineId])

  // Keyboard Policy:
  // 1. In Lobby with 0 Balance (balance <= 0): Block general keyboard typing/navigation
  //    to prevent tampering on public kiosk screens.
  //    (Staff shortcuts Ctrl+Shift+K/D/R/X/H/L, staff password gates, and barcode scanner still work).
  // 2. When Balance is updated (balance > 0): Keyboard is fully enabled for gameplay.
  useEffect(() => {
    function handleKioskKeyboardPolicy(e: KeyboardEvent) {
      const currentBal = useMachine.getState().balance
      // When balance > 0, keyboard is fully enabled for games
      if (currentBal > 0) return

      // Allow staff hotkeys (Ctrl+Shift+...)
      if (e.ctrlKey && e.shiftKey) return

      // Allow typing in active input/textarea fields (e.g. staff password modals)
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.winbet-modal-card') ||
          target.closest('.pending-card') ||
          target.closest('.hw-diag-modal'))
      ) {
        return
      }

      // If user is inside an active game (like Lucky Wheel or Aviator), allow game controls
      if (document.body.classList.contains('is-game-active')) {
        return
      }

      // Block non-staff browser/kiosk keys when in zero-balance lobby
      if (
        e.key === 'Tab' ||
        e.key === ' ' ||
        e.key === 'Spacebar' ||
        e.key === 'Backspace' ||
        e.key === 'Escape' ||
        e.key.startsWith('Arrow') ||
        (e.key.startsWith('F') && e.key.length <= 3) ||
        e.key === 'Home' ||
        e.key === 'End' ||
        e.key === 'PageUp' ||
        e.key === 'PageDown'
      ) {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKioskKeyboardPolicy, false)
    return () => window.removeEventListener('keydown', handleKioskKeyboardPolicy, false)
  }, [])

  // Ctrl+Shift+R shortcut:
  // When balance is zero (<= 0), redirect to register page.
  // When balance > 0, block reload and inform user to cash out first.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault()
        e.stopPropagation()
        const currentBal = useMachine.getState().balance
        if (currentBal <= 0) {
          if (onRegisterToken) {
            onRegisterToken()
          } else {
            onUnauthorized()
          }
        } else {
          showAlert({
            tone: 'warn',
            title: 'Active Balance',
            message: `Balance ${config?.CurrencySymbol ?? 'N$'} ${currentBal.toFixed(2)} — please cash out first.`,
            autoCloseMs: 4000,
          })
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onRegisterToken, onUnauthorized, showAlert, config?.CurrencySymbol])

  function showCashAdded(amount: number) {
    setNoteInProgress(null)
    clearAlert()
    setLastCash(amount)
    setCreditSource('cash')
    setCashInOpen(true)
  }

  /** Realtime push shows the new balance → open Cash Added now instead of waiting for the HTTP reply. */
  function finishNoteFromPush(nextBalance: number): boolean {
    const p = pendingNote.current
    if (!p || p.shown || nextBalance < p.previousBal + p.amount - 0.001) return false
    p.shown = true
    uiLog(`bill_in_shown_from_push amount=${p.amount}`)
    showCashAdded(p.amount)
    return true
  }

  async function acceptCash(amount: number): Promise<boolean> {
    if (useMachine.getState().installTestActive) {
      return false
    }
    const now = Date.now()
    if (
      lastBillInAmount.current === amount &&
      now - lastBillInAt.current < 2000
    ) {
      return false
    }
    lastBillInAmount.current = amount
    lastBillInAt.current = now
    setNoteInProgress(amount)
    const previousBal = useMachine.getState().balance
    const pending = { amount, previousBal, shown: false }
    pendingNote.current = pending

    try {
      const hardwareId = await getLiveHardwareId()
      const startedAt = performance.now()
      const result = await billIn(terminal.machineId, hardwareId, amount)
      uiLog(`bill_in_ok amount=${amount} server_ms=${Math.round(performance.now() - startedAt)}`)
      if (pendingNote.current === pending) pendingNote.current = null
      const creditedAmount = result.amount > 0 
        ? result.amount 
        : (result.current_balance > previousBal ? result.current_balance - previousBal : amount)
      const bal = result.current_balance > 0 ? result.current_balance : previousBal + creditedAmount
      setBalance(bal)
      if (result.available_coins != null) {
        void setShopAvailableCoins(result.available_coins)
      }
      if (!pending.shown) {
        pending.shown = true
        showCashAdded(creditedAmount > 0 ? creditedAmount : amount)
      }

      void fetchSession(terminal.machineId, hardwareId)
        .then((s) => {
          if (s.current_balance != null && Number.isFinite(s.current_balance)) {
            setBalance(s.current_balance)
          }
          if (s.available_coins != null) {
            void setShopAvailableCoins(s.available_coins)
          }
        })
        .catch(() => undefined)

      return true
    } catch (err) {
      if (pendingNote.current === pending) pendingNote.current = null
      setNoteInProgress(null)
      lastBillInAmount.current = null
      lastBillInAt.current = 0
      if (isHardwareUnauthorized(err)) {
        setHardwareBlocked(true)
        return false
      }
      const cashMessage = friendlyMessage(err)
      const isShopLow = cashMessage.toLowerCase().includes('shop balance')
      showAlert({
        tone: 'error',
        title: isShopLow ? 'Shop balance too low' : 'Cash not accepted',
        message: cashMessage,
        autoCloseMs: 0,
      })
      return false
    }
  }

  async function redeemTicket(code: string): Promise<boolean> {
    if (useMachine.getState().installTestActive) {
      uiLog('ticket_ignored reason=staff_hardware_test_open', 'warn')
      return false
    }
    if (redeemBusy.current) {
      uiLog('ticket_ignored reason=already_checking_a_ticket', 'warn')
      return false
    }
    const barcode = code.trim().toUpperCase()
    if (!barcode) return false

    uiLog(`ticket_check_start code=${barcode}`)
    redeemBusy.current = true
    clearAlert()
    setShowInsertMoneyModal(false)
    setShowCashOutConfirm(false)
    setCheckingTicket(true)
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      const hardwareId = await getLiveHardwareId()
      const previousBal = useMachine.getState().balance
      const result = await Promise.race([
        ticketIn(terminal.machineId, hardwareId, barcode),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('The ticket check is taking too long. Please ask the cashier.')),
            TICKET_CHECK_TIMEOUT_MS,
          )
        }),
      ])
      uiLog(`ticket_credited code=${barcode} amount=${result.amount} balance=${result.current_balance}`)
      clearAlert()
      const creditedAmount = result.amount > 0 
        ? result.amount 
        : (result.current_balance > previousBal ? result.current_balance - previousBal : 0)
      const bal = result.current_balance > 0 ? result.current_balance : previousBal + (creditedAmount > 0 ? creditedAmount : 0)
      setBalance(bal)
      setLastCash(creditedAmount > 0 ? creditedAmount : (result.amount > 0 ? result.amount : (bal > 0 ? bal : null)))
      setLastTicket(result.barcode || barcode)
      setCreditSource('ticket')

      void fetchSession(terminal.machineId, hardwareId)
        .then((s) => {
          if (s.current_balance != null && Number.isFinite(s.current_balance)) {
            setBalance(s.current_balance)
          }
          if (s.available_coins != null) {
            void setShopAvailableCoins(s.available_coins)
          }
        })
        .catch(() => undefined)

      setCashInOpen(true)
      return true
    } catch (err) {
      uiLog(`ticket_failed code=${barcode} error=${err instanceof Error ? err.message : String(err)}`, 'error')
      if (isHardwareUnauthorized(err)) {
        setHardwareBlocked(true)
        return false
      }
      const ticketMessage = friendlyMessage(
        err,
        'This ticket could not be checked. Please try again or ask the cashier.',
      )
      showAlert({
        tone: 'error',
        title: ticketErrorTitle(ticketMessage),
        message: ticketMessage,
        autoCloseMs: 0,
      })
      return false
    } finally {
      clearTimeout(timeoutId)
      setCheckingTicket(false)
      redeemBusy.current = false
    }
  }

  function showPrinterAlert(title = 'Printer not connected') {
    const bal = useMachine.getState().balance
    const symbol = config?.CurrencySymbol ?? 'N$'
    showAlert({
      tone: 'warn',
      title,
      message:
        bal > 0
          ? `The ticket printer is not connected, so a cash-out ticket cannot be printed right now. Your balance ${symbol} ${bal.toFixed(2)} stays on this terminal. Please ask the cashier.`
          : 'The ticket printer is not connected, so a cash-out ticket cannot be printed right now. Your balance stays on this terminal. Please ask the cashier.',
      autoCloseMs: 0,
    })
  }

  async function cashOut(opts?: { simulatePrintFail?: boolean }) {
    const lab = isHardwareSimulatorEnabled()
    const symbol = config?.CurrencySymbol ?? 'N$'

    if (balance <= 0) {
      setShowInsertMoneyModal(true)
      return null
    }

    if (!lab) {
      // Cash-out requires a live printer — same rule as Electron kiosk.
      // It was ready when the confirm pop-up opened, so this cancels a cash-out in progress.
      try {
        const hw = await fetchHardwareStatus()
        if (!hw?.printer.connected) {
          setPrinterReady(false)
          showPrinterAlert('Cash-out cancelled')
          return null
        }
      } catch {
        setPrinterReady(false)
        showPrinterAlert('Cash-out cancelled')
        return null
      }
    }

    let issuedBarcode: string | null = null
    const kioskBalanceBeforeCashout = balance
    try {
      const hardwareId = await getLiveHardwareId()
      const ticket = await cashOutTicket(terminal.machineId, hardwareId)
      issuedBarcode = ticket.barcode

      const rawTicketAmount = Number(ticket.amount)
      const validAmount =
        Number.isFinite(rawTicketAmount) && rawTicketAmount > 0
          ? rawTicketAmount
          : kioskBalanceBeforeCashout > 0
            ? kioskBalanceBeforeCashout
            : 0

      ticket.amount = validAmount
      setLastTicket(ticket.barcode)
      setLastCash(validAmount)

      const demoTicket = {
        barcode: ticket.barcode,
        amount: validAmount,
        currencySymbol: symbol,
        kioskName: config?.Terminal_ID ?? terminal.pcName,
        issuedAt: new Date().toLocaleString(),
      }

      async function restoreAfterPrintFail(barcode: string, printErr?: unknown) {
        try {
          const restored = await cancelCashOutTicket(terminal.machineId, hardwareId, barcode)
          setBalance(restored.current_balance)
          setLastTicket(null)
          setPrinterWarning(null)
          showAlert({
            tone: 'error',
            title: 'Cash-out cancelled',
            message: `${friendlyMessage(printErr, PLAIN.printerNotResponding)} Your balance stays on this terminal.`,
            autoCloseMs: 0,
          })
        } catch (restoreErr) {
          const blocked = String(restoreErr instanceof Error ? restoreErr.message : restoreErr)
            .toLowerCase()
            .includes('too low to restore')
          setBalance(0)
          setLastTicket(barcode)
          setPrinterWarning(null)
          showAlert({
            tone: 'error',
            title: blocked ? 'Please see the cashier' : 'Cash-out cancelled',
            message: blocked
              ? 'The ticket could not be printed and the shop balance is too low to put your money back on this terminal. Please see the cashier — your money is safe.'
              : `${friendlyMessage(printErr ?? restoreErr, PLAIN.printerNotResponding)} Your balance may show 0 for a moment — please ask the cashier.`,
            autoCloseMs: 0,
          })
        }
      }

      if (lab && opts?.simulatePrintFail) {
        await restoreAfterPrintFail(ticket.barcode)
        return null
      }

      let printedToHardware = false
      if (isTauriApp()) {
        try {
          await printCashOutTicket({
            code: ticket.barcode,
            amount: validAmount,
            currency: config?.Currency ?? 'NAD',
            currencySymbol: symbol,
            terminalId: config?.Terminal_ID ?? terminal.pcName,
          })
          printedToHardware = true
        } catch (printErr) {
          if (!lab) {
            await restoreAfterPrintFail(ticket.barcode, printErr)
            return null
          }
          console.warn('Physical printer skipped/failed in lab mode:', printErr)
        }
      }

      if (!printedToHardware && lab) {
        downloadDemoTicket(demoTicket)
      }

      setBalance(0)
      setPrinterWarning(null)
      navigate('/cash-out')
      return demoTicket
    } catch (err) {
      if (issuedBarcode) {
        try {
          const hardwareId = await getLiveHardwareId()
          const restored = await cancelCashOutTicket(
            terminal.machineId,
            hardwareId,
            issuedBarcode,
          )
          setBalance(restored.current_balance)
          setLastTicket(null)
          setPrinterWarning(null)
        } catch (restoreErr) {
          const blocked = String(restoreErr instanceof Error ? restoreErr.message : restoreErr)
            .toLowerCase()
            .includes('too low to restore')
          setBalance(0)
          setLastTicket(issuedBarcode)
          setPrinterWarning(null)
          showAlert({
            tone: 'error',
            title: blocked ? 'Please see the cashier' : 'Cash-out cancelled',
            message: blocked
              ? 'The ticket could not be printed and the shop balance is too low to put your money back on this terminal. Please see the cashier — your money is safe.'
              : `${friendlyMessage(err, PLAIN.printerNotResponding)} Your balance may show 0 for a moment — please ask the cashier.`,
            autoCloseMs: 0,
          })
          return null
        }
        showAlert({
          tone: 'error',
          title: 'Cash-out cancelled',
          message: `${friendlyMessage(err, PLAIN.printerNotResponding)} Your balance stays on this terminal.`,
          autoCloseMs: 0,
        })
        return null
      }
      if (isHardwareUnauthorized(err)) {
        setHardwareBlocked(true)
        return null
      }
      showAlert({
        tone: 'error',
        title: 'Cash out failed',
        message: friendlyMessage(err),
        autoCloseMs: 0,
      })
      return null
    }
  }

  if (hardwareBlocked) {
    return (
      <UnauthorizedScreen
        terminalId={terminal.pcName || config?.Terminal_ID}
        onRegisterAgain={onRegisterToken || onUnauthorized}
      />
    )
  }

  /** Ask the printer now: the status poll can be a moment behind a power switch. */
  async function livePrinterReady(): Promise<boolean> {
    try {
      const status = await fetchHardwareStatus()
      if (status?.printer.connected) return true
      // Just switched back on? Pick it up now instead of at the next retry.
      const after = await reconnectMissingHardware()
      return !!after?.printer.connected
    } catch {
      return false
    }
  }

  const handleRequestCashOut = async () => {
    if (balance <= 0) {
      setShowInsertMoneyModal(true)
      return
    }
    if (!isHardwareSimulatorEnabled()) {
      const ready = await livePrinterReady()
      setPrinterReady(ready)
      if (!ready) {
        showPrinterAlert()
        return
      }
    }
    setShowCashOutConfirm(true)
  }

  const handleConfirmCashOut = async () => {
    setCashOutBusy(true)
    cashOutInFlight.current = true
    try {
      setShowCashOutConfirm(false)
      await cashOut()
    } finally {
      cashOutInFlight.current = false
      setCashOutBusy(false)
    }
  }

  const labEnabled = isHardwareSimulatorEnabled()

  function withArena(node: ReactNode, opts?: { creditPanel?: boolean; hideHeader?: boolean }) {
    return (
      <ArenaShell
        onCashOut={handleRequestCashOut}
        showCreditPanel={opts?.creditPanel !== false}
        hideHeader={opts?.hideHeader}
        printerReady={printerReady || labEnabled}
        onRegisterToken={onRegisterToken || onUnauthorized}
      >
        {node}
      </ArenaShell>
    )
  }

  return (
    <div className="app-shell">
      <StatusToast />
      <KioskAlert />
      <TicketChecking open={checkingTicket} />
      <TicketChecking
        open={noteInProgress != null && !checkingTicket}
        kind="cash"
        title="Checking your note…"
        text={`${config?.CurrencySymbol ?? 'N$'} ${(noteInProgress ?? 0).toFixed(2)} — please wait a moment.`}
      />
      <TicketChecking
        open={cashOutBusy}
        title="Printing your ticket…"
        text="Please wait for the printer to finish."
      />
      <CashInsertedScreen open={cashInOpen} onClose={closeCashIn} />
      <CashOutConfirmModal
        isOpen={showCashOutConfirm}
        loading={cashOutBusy}
        onConfirm={() => void handleConfirmCashOut()}
        onCancel={() => {
          blockTapsBriefly()
          setShowCashOutConfirm(false)
        }}
      />
      {/* <HardwareLabPanel
        balance={balance}
        currencySymbol={config?.CurrencySymbol ?? 'N$'}
        kioskName={config?.Terminal_ID ?? terminal.pcName}
        adminPassword={config?.AdminPassword ?? 'admin123'}
        onBillIn={(amount) => acceptCash(amount)}
        onTicketIn={(code) => redeemTicket(code)}
        onCashOut={(simulatePrintFail) => cashOut({ simulatePrintFail })}
      /> */}
      {ready ? (
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={withArena(<HomeScreen />)} />
        <Route path="/play" element={withArena(<GamesLobby />)} />
        <Route
          path="/play/aviator"
          element={withArena(
            <RequireCredit>
              <AviatorGame />
            </RequireCredit>,
            { creditPanel: false, hideHeader: true },
          )}
        />
        <Route
          path="/play/wheel"
          element={withArena(
            <RequireCredit>
              <LuckyWheelGame />
            </RequireCredit>,
            { creditPanel: false, hideHeader: true },
          )}
        />
        <Route path="/cash-in" element={<Navigate to="/play" replace />} />
        <Route path="/cash-out" element={withArena(<CashOutScreen />, { creditPanel: false })} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      ) : null}
    </div>
  )
}
