import { createPortal } from 'react-dom';
import { useMachine } from '../services/sessionStore';
import { useShallow } from 'zustand/react/shallow';

type Props = {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

export function CashOutConfirmModal({ isOpen, onConfirm, onCancel, loading = false }: Props) {
  const { balance, config } = useMachine(useShallow((s) => ({ balance: s.balance, config: s.config })));
  const symbol = config?.CurrencySymbol ?? 'N$';

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="kx-alert-backdrop winbet-modal-backdrop"
      role="presentation"
      style={{ zIndex: 1100 }}
      onClick={onCancel}
    >
      <div
        className="winbet-modal-card icon-gold animate-pop-in cash-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cashout-confirm-title"
        aria-describedby="cashout-confirm-desc"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Badge */}
        <div className="winbet-modal-badge">
          <span className="modal-badge-num">04</span>
          <span className="modal-badge-title">Cash-Out Confirmation</span>
        </div>

        {/* Center Glowing Gold Printer Icon */}
        <div className="winbet-modal-icon-glow icon-gold">
          <span className="modal-icon-symbol">
            <i className="fa-solid fa-print" />
          </span>
        </div>

        {/* Heading & Subtext */}
        <h2 id="cashout-confirm-title" className="winbet-modal-title title-gold">
          CONFIRM CASH OUT
        </h2>
        <p id="cashout-confirm-desc" className="winbet-modal-desc">
          Are you sure you want to cash out? A barcode voucher ticket will be printed from the receipt printer.
        </p>

        {/* Recessed Info Card */}
        <div className="winbet-modal-recessed-box" style={{ width: '100%', margin: '0.75rem 0 1.25rem 0' }}>
          <div className="recessed-row">
            <span className="recessed-label">
              <i className="fa-solid fa-coins text-warning me-1.5" /> Cash-Out Amount:
            </span>
            <span className="recessed-value status-highlight" style={{ fontSize: '1.15rem' }}>
              {symbol} {Number(balance || 0).toFixed(2)}
            </span>
          </div>

          {/* <div className="recessed-row">
            <span className="recessed-label">
              <i className="fa-solid fa-desktop text-cyan me-1.5" /> Station:
            </span>
            <span className="recessed-value">{pcName} ({siteName})</span>
          </div>

          <div className="recessed-row">
            <span className="recessed-label">
              <i className="fa-solid fa-receipt text-muted me-1.5" /> Print Output:
            </span>
            <span className="recessed-value text-success">Epson Thermal Printer</span>
          </div> */}
        </div>

        {/* Modal Action Buttons */}
        <div className="winbet-modal-actions">
          <button
            type="button"
            className="btn-winbet-modal-primary btn-play-now"
            disabled={loading}
            onClick={onConfirm}
          >
            <span>
              <i className="fa-solid fa-print me-1.5" />
              {loading ? 'Processing & Printing…' : 'CONFIRM & PRINT TICKET ›'}
            </span>
          </button>

          <button
            type="button"
            className="btn-winbet-modal-secondary"
            disabled={loading}
            onClick={onCancel}
          >
            ✕ CANCEL (KEEP PLAYING)
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
