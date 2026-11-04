import { useEffect } from 'react';
import { useMachine } from '../services/sessionStore';

export default function StatusToast() {
  const status = useMachine((s) => s.statusMessage);
  const setStatus = useMachine((s) => s.setStatus);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status, setStatus]);

  if (!status) return null;

  return (
    <div className={`toast tone-${status.tone}`} role="status">
      {status.text}
    </div>
  );
}
