import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMachine } from '../services/sessionStore'
import { useShallow } from 'zustand/react/shallow'

const AUTO_SECONDS = 5

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? 0))
  return Number.isFinite(n) ? n : 0
}

type Props = {
  open: boolean
  onClose: () => void
}

/** "Cash Added" popup drawn over the current screen (no page change, so it opens instantly). */
export default function CashInsertedScreen({ open, onClose }: Props) {
  const { balance, config, lastCashAmount, creditSource, lastTicketCode } = useMachine(
    useShallow((s) => ({
      balance: s.balance,
      config: s.config,
      lastCashAmount: s.lastCashAmount,
      creditSource: s.creditSource,
      lastTicketCode: s.lastTicketCode,
    })),
  )
  const [secondsLeft, setSecondsLeft] = useState(AUTO_SECONDS)

  useEffect(() => {
    if (!open) return
    setSecondsLeft(AUTO_SECONDS)
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onClose()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [open, onClose, lastCashAmount, lastTicketCode, balance])

  if (!open) return null

  const symbol = config?.CurrencySymbol ?? 'N$'
  const fromTicket = creditSource === 'ticket'
  const amount = toNumber(lastCashAmount)
  const newBalance = toNumber(balance)
  const displayAmount = amount > 0 ? amount : newBalance
  const money = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return createPortal(
    <div className="cashin-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cashin-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cashin-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cashin-icon" aria-hidden="true">
          <i className={fromTicket ? 'fa-solid fa-ticket' : 'fa-solid fa-money-bill-wave'} />
          <span className="cashin-icon-check">
            <i className="fa-solid fa-check" />
          </span>
        </div>

        <h2 id="cashin-title" className="cashin-title">
          {fromTicket ? 'Ticket Added' : 'Cash Added'}
        </h2>

        <div className="cashin-amount">
          <span className="cashin-amount-sign">+{symbol}</span>
          <span className="cashin-amount-value">{money(displayAmount)}</span>
        </div>

        <div className="cashin-balance">
          <span>New balance</span>
          <strong>
            {symbol} {money(newBalance)}
          </strong>
        </div>

        <button type="button" className="cashin-play" onClick={onClose}>
          <span
            key={`${lastCashAmount}-${lastTicketCode}-${balance}`}
            className="cashin-play-fill"
            style={{ animationDuration: `${AUTO_SECONDS}s` }}
            aria-hidden="true"
          />
          <span className="cashin-play-label">
            PLAY NOW <span className="cashin-play-count">{secondsLeft}</span>
          </span>
        </button>
      </div>
    </div>,
    document.body,
  )
}
