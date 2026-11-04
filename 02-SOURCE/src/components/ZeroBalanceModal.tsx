import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMachine } from '../services/sessionStore'
import { useShallow } from 'zustand/react/shallow'

const ACCEPTED_NOTES = [10, 20, 50, 100, 200]

export function ZeroBalanceModal() {
  const { balance, config, showInsertMoneyModal, setShowInsertMoneyModal } = useMachine(
    useShallow((s) => ({
      balance: s.balance,
      config: s.config,
      showInsertMoneyModal: s.showInsertMoneyModal,
      setShowInsertMoneyModal: s.setShowInsertMoneyModal,
    })),
  )
  const numBalance = typeof balance === 'number' && Number.isFinite(balance) ? balance : 0
  const symbol = config?.CurrencySymbol ?? 'N$'

  // Close as soon as money is loaded (the Cash Added pop-up takes over)
  useEffect(() => {
    if (numBalance > 0 && showInsertMoneyModal) {
      setShowInsertMoneyModal(false)
    }
  }, [numBalance, showInsertMoneyModal, setShowInsertMoneyModal])

  if (!showInsertMoneyModal || numBalance > 0) {
    return null
  }

  function handleClose() {
    setShowInsertMoneyModal(false)
  }

  return createPortal(
    <div className="cashin-backdrop insert-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="cashin-card insert-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="insert-title"
        aria-describedby="insert-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="insert-close" onClick={handleClose} aria-label="Close">
          <i className="fa-solid fa-xmark" />
        </button>

        <div className="insert-visual" aria-hidden="true">
          <span className="insert-note">
            <i className="fa-solid fa-money-bill-wave" />
          </span>
          <span className="insert-slot" />
        </div>

        <h2 id="insert-title" className="insert-title">
          Insert Money to Play
        </h2>
        <p id="insert-desc" className="insert-text">
          Insert a note or scan your ticket to start playing.
        </p>

        <div className="insert-options">
          <div className="insert-option">
            <span className="insert-option-icon is-cash">
              <i className="fa-solid fa-money-bill-1-wave" />
            </span>
            <span className="insert-option-title">Insert cash</span>
            <span className="insert-option-notes">
              {ACCEPTED_NOTES.map((n) => (
                <span key={n} className="insert-note-chip">
                  {n}
                </span>
              ))}
            </span>
            <span className="insert-option-sub">{symbol} notes</span>
          </div>

          <div className="insert-option">
            <span className="insert-option-icon is-ticket">
              <i className="fa-solid fa-barcode" />
            </span>
            <span className="insert-option-title">Scan ticket</span>
            <span className="insert-option-sub">Hold the barcode under the scanner</span>
          </div>
        </div>

        <button type="button" className="insert-browse" onClick={handleClose}>
          Browse Games <i className="fa-solid fa-arrow-right" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
