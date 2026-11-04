import { useEffect, useRef } from 'react'
import { isTerminalRealtimeEnabled } from '../config/env'
import { getLiveHardwareId } from './storage'
import { connectTerminalEcho, disconnectTerminalEcho } from './terminalEcho'

type TerminalRealtimeHandlers = {
  onApproved: (payload: Record<string, unknown>) => void
  onRejected: (payload: Record<string, unknown>) => void
  onLoadSuccess: (payload: Record<string, unknown>) => void
  onPlayerBalance: (chips: number) => void
  onConnected: () => void
}

function readChips(payload: Record<string, unknown>): number | null {
  const chips = Number(payload.chips)
  return Number.isFinite(chips) ? chips : null
}

export function useTerminalRealtime(
  machineDbId: number | undefined,
  machineId: string,
  handlers: TerminalRealtimeHandlers,
  playerId?: number | null,
) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!machineDbId || !isTerminalRealtimeEnabled()) {
      disconnectTerminalEcho()
      return
    }

    let cancelled = false
    const playerChannel = playerId && playerId > 0 ? `player.${playerId}` : null

    void (async () => {
      const hardwareId = await getLiveHardwareId()
      if (cancelled) return

      const echo = connectTerminalEcho({ machineId, hardwareId })
      if (!echo || cancelled) {
        if (cancelled) disconnectTerminalEcho()
        return
      }

      const connection = echo.connector.pusher.connection
      const onConnected = () => handlersRef.current.onConnected()
      connection.bind('connected', onConnected)
      if (connection.state === 'connected') {
        onConnected()
      }

      echo
        .private(`terminal.${machineDbId}`)
        .listen('.CASHOUT_APPROVED', (payload: Record<string, unknown>) => {
          handlersRef.current.onApproved(payload)
        })
        .listen('.CASHOUT_REJECTED', (payload: Record<string, unknown>) => {
          handlersRef.current.onRejected(payload)
        })
        .listen('.LOAD_SUCCESS', (payload: Record<string, unknown>) => {
          handlersRef.current.onLoadSuccess(payload)
        })

      if (playerChannel) {
        const applyBalance = (payload: Record<string, unknown>) => {
          const chips = readChips(payload)
          if (chips != null) {
            handlersRef.current.onPlayerBalance(chips)
          }
        }
        echo
          .channel(playerChannel)
          .listen('.PlayerBalanceUpdated', applyBalance)
          .listen('PlayerBalanceUpdated', applyBalance)
      }
    })()

    return () => {
      cancelled = true
      disconnectTerminalEcho()
    }
  }, [machineId, machineDbId, playerId])
}
