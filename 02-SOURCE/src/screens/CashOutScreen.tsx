import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cancelCashOutTicket } from '../api/client'
import { getLiveHardwareId } from '../lib/storage'
import { uiLog } from '../lib/uiLog'
import { useMachine } from '../services/sessionStore'
import { useShallow } from 'zustand/react/shallow'
import { friendlyMessage } from '../utils/friendlyMessage'

/**
 * A ticket can come out blank (paper loaded the wrong way round) without the printer knowing.
 * For this long the customer can void it and keep the balance; after that the screen may face
 * the next player, who must not be able to cancel someone else's ticket.
 */
const NOT_PRINTED_WINDOW_MS = 60000

export default function CashOutScreen() {
  const navigate = useNavigate()
  const { config, machineId, lastTicketCode, lastCashAmount, printerWarning, setBalance, setLastTicket, showAlert } = useMachine(
    useShallow((s) => ({
      config: s.config,
      machineId: s.machineId,
      lastTicketCode: s.lastTicketCode,
      lastCashAmount: s.lastCashAmount,
      printerWarning: s.printerWarning,
      setBalance: s.setBalance,
      setLastTicket: s.setLastTicket,
      showAlert: s.showAlert,
    })),
  )
  const symbol = config?.CurrencySymbol ?? 'N$'
  const amount = lastCashAmount ?? 0
  const [canUndo, setCanUndo] = useState(true)
  const [undoing, setUndoing] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setCanUndo(false), NOT_PRINTED_WINDOW_MS)
    return () => window.clearTimeout(timer)
  }, [lastTicketCode])

  async function ticketNotPrinted() {
    const code = lastTicketCode
    if (!code || undoing) return
    setUndoing(true)
    try {
      const hardwareId = await getLiveHardwareId()
      const restored = await cancelCashOutTicket(machineId, hardwareId, code)
      uiLog(`cashout_undone_ticket_not_printed code=${code} balance=${restored.current_balance}`, 'warn')
      setBalance(restored.current_balance)
      setLastTicket(null)
      showAlert({
        tone: 'ok',
        title: 'Balance restored',
        message: `Ticket ${code} is cancelled and can no longer be used. Your balance ${symbol} ${restored.current_balance.toFixed(2)} is back on this terminal.`,
        autoCloseMs: 0,
      })
      navigate('/play')
    } catch (err) {
      uiLog(`cashout_undo_failed code=${code} error=${err instanceof Error ? err.message : String(err)}`, 'error')
      setCanUndo(false)
      showAlert({
        tone: 'error',
        title: 'Please see the cashier',
        message: `${friendlyMessage(err, 'The ticket could not be cancelled here.')} Show ticket code ${code} to the cashier — your money is safe.`,
        autoCloseMs: 0,
      })
    } finally {
      setUndoing(false)
    }
  }

  return (
    <div className="cash-inserted-fullscreen-overlay">
      <div className="winbet-modal-card animate-pop-in">
        {/* Glowing Circular Icon */}
        <div className="winbet-modal-icon-glow icon-gold" style={{ margin: '0 auto 12px auto' }}>
          <span className="modal-icon-symbol">🖨</span>
        </div>
        
        <h1 className="winbet-modal-title title-gold" style={{ marginTop: 8 }}>Cash Out Complete</h1>
        <p className="winbet-modal-desc">
          Take the printed voucher ticket below. Scan it on any terminal or redeem at the cashier desk.
        </p>

        {/* Realistic Theme-Friendly Digital Ticket Display */}
        <div className="premium-digital-ticket">
          <div className="ticket-header">
            <div className="ticket-logo">BETWISE TERMINAL TICKET</div>
            <div className="ticket-terminal">{config?.Terminal_ID || 'TERMINAL-001'}</div>
          </div>
          
          <div className="ticket-amount-box">
            <div className="ticket-label">Payable Amount</div>
            <div className="ticket-amt title-gold">{symbol} {amount.toFixed(2)}</div>
          </div>
          
          <div className="ticket-barcode-box">
            <div className="digital-barcode">
              |||| |||| |||| || 
            </div>
            <div className="barcode-code-text title-cyan">{lastTicketCode || 'PRINTING…'}</div>
          </div>
        </div>

        {printerWarning ? (
          <p className="winbet-error-msg" style={{ margin: '12px auto', maxWidth: 400 }}>
            {printerWarning}
          </p>
        ) : null}

        <p className="muted" style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 16 }}>
          Terminal balance is now <strong>{symbol} 0.00</strong>
        </p>

        <div className="winbet-modal-actions" style={{ width: '100%' }}>
          <button
            type="button"
            className="btn-winbet-modal-primary icon-gold"
            onClick={() => navigate('/home')}
            disabled={undoing}
          >
            ✓ RETURN TO LOBBY
          </button>
          {lastTicketCode && canUndo ? (
            <button
              type="button"
              className="btn-winbet-modal-secondary"
              onClick={() => void ticketNotPrinted()}
              disabled={undoing}
            >
              {undoing ? 'Cancelling ticket…' : `TICKET BLANK OR NOT PRINTED? PUT ${symbol} ${amount.toFixed(2)} BACK`}
            </button>
          ) : null}
        </div>

        {lastTicketCode && !canUndo ? (
          <p className="muted" style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 12 }}>
            Ticket not printed? Show code <strong>{lastTicketCode}</strong> to the cashier.
          </p>
        ) : null}
      </div>
    </div>
  )
}
