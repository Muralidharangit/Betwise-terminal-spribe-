import { useRef, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useMachine } from '../services/sessionStore'

/**
 * Gate game entry when there is no credit.
 * Once the player is inside a game, do NOT bounce them out when a stake
 * temporarily brings balance to 0 mid-round (that was kicking Lucky Wheel out on Spin).
 */
export function RequireCredit({ children }: { children: ReactNode }) {
  const balance = useMachine((s) => s.balance)
  const enteredWithCredit = useRef(balance > 0)

  if (!enteredWithCredit.current) {
    return <Navigate to="/home" replace state={{ needCash: true }} />
  }

  return <>{children}</>
}
