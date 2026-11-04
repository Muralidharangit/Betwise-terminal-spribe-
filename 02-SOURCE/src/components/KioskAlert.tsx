import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMachine } from '../services/sessionStore';

type Kind = 'printer' | 'scan' | 'ticket' | 'cash' | 'balance' | 'ok' | 'warn' | 'error';

function kindOf(title: string, tone: 'ok' | 'warn' | 'error'): Kind {
  const t = title.toLowerCase();
  if (t.includes('printer')) return 'printer';
  if (t.includes('scan')) return 'scan';
  if (t.startsWith('ticket') || t.includes('wrong ticket')) return 'ticket';
  if (t.includes('cash not accepted') || t.includes('note') || t.includes('bill')) return 'cash';
  if (t.includes('active balance')) return 'balance';
  return tone;
}

function Icon({ kind }: { kind: Kind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'printer':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M7 9V3h10v6" />
          <rect x="3" y="9" width="18" height="8" rx="2" />
          <path d="M7 14h10v7H7z" />
          <circle cx="17.5" cy="12" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'scan':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3" />
          <path d="M7 8v8M10 8v8M13 8v8M16 8v8" />
        </svg>
      );
    case 'ticket':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2V8Z" />
          <path d="M9 9v6M12 9v6M15 9v6" />
        </svg>
      );
    case 'cash':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.6" />
          <path d="M6 10v4M18 10v4" />
        </svg>
      );
    case 'balance':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h12v4" />
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M16 13.5h2" />
        </svg>
      );
    case 'ok':
      return (
        <svg viewBox="0 0 24 24" {...common} strokeWidth={2.6}>
          <path d="M5 12.5 10 17l9-10" />
        </svg>
      );
    case 'warn':
      return (
        <svg viewBox="0 0 24 24" {...common} strokeWidth={2.6}>
          <path d="M12 6v8" />
          <circle cx="12" cy="18" r="0.8" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" {...common} strokeWidth={2.6}>
          <path d="M7 7l10 10M17 7 7 17" />
        </svg>
      );
  }
}

export default function KioskAlert() {
  const alert = useMachine((s) => s.alert);
  const clearAlert = useMachine((s) => s.clearAlert);

  const closeMs = alert ? (alert.autoCloseMs ?? (alert.tone === 'ok' ? 3500 : 0)) : 0;

  useEffect(() => {
    if (!alert || !closeMs) return;
    const t = setTimeout(() => clearAlert(), closeMs);
    return () => clearTimeout(t);
  }, [alert, closeMs, clearAlert]);

  if (!alert) return null;

  const kind = kindOf(alert.title, alert.tone);
  const btnText = kind === 'scan' ? 'SCAN AGAIN' : kind === 'cash' ? 'TRY AGAIN' : alert.tone === 'ok' ? 'CONTINUE' : 'OK';

  return createPortal(
    <div className="kx-msg-backdrop" role="presentation" onClick={() => clearAlert()}>
      <div
        className={`kx-msg-card tone-${alert.tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="kx-msg-title"
        aria-describedby="kx-msg-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kx-msg-icon" aria-hidden="true">
          <Icon kind={kind} />
        </div>

        <h2 id="kx-msg-title" className="kx-msg-title">
          {alert.title}
        </h2>
        <p id="kx-msg-body" className="kx-msg-text">
          {alert.message}
        </p>

        <button type="button" className="kx-msg-btn" onClick={() => clearAlert()}>
          {btnText}
        </button>

        {closeMs > 0 && (
          <span
            key={`${alert.title}-${alert.message}`}
            className="kx-msg-timer"
            style={{ animationDuration: `${closeMs}ms` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Shown while a ticket or note is being checked; cannot be dismissed. */
export function TicketChecking({
  open,
  kind = 'ticket',
  title = 'Checking ticket…',
  text = 'Please wait a moment.',
}: {
  open: boolean;
  kind?: 'ticket' | 'cash';
  title?: string;
  text?: string;
}) {
  if (!open) return null;
  return createPortal(
    <div className="kx-msg-backdrop" role="presentation">
      <div className="kx-msg-card tone-checking" role="status" aria-live="polite">
        <div className="kx-msg-icon kx-msg-icon-spin" aria-hidden="true">
          <Icon kind={kind} />
        </div>
        <h2 className="kx-msg-title">{title}</h2>
        <p className="kx-msg-text">{text}</p>
      </div>
    </div>,
    document.body,
  );
}
