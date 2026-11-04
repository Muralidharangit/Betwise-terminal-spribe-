import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchSession, formatCurrency, launchProviderGame } from '../api/client'
import type { GameDefinition } from '../games/catalog'
import { loadTerminal } from '../lib/storage'
import { useMachine } from '../services/sessionStore'

type Props = {
  game: GameDefinition
  machineId: string
  balance: number
  disabled: boolean
  onBack: () => void
  onError: (message: string) => void
  onClosed: () => void
  getHardwareId: () => Promise<string>
}

const FALLBACK_PLACEHOLDER = '/assets/img/placeholder.png'
/** Show the iframe even if its load event never arrives (slow network, blocked event). */
const IFRAME_REVEAL_FALLBACK_MS = 8000

export function ProviderGamePanel({
  game,
  machineId,
  balance,
  disabled,
  onBack,
  onError,
  onClosed,
  getHardwareId,
}: Props) {
  const [gameUrl, setGameUrl] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [iframeKey, setIframeKey] = useState(0)
  const [iframeReady, setIframeReady] = useState(false)

  const liveBalance = useMachine((s) => s.balance)
  const displayBalance = liveBalance ?? balance

  const onBackRef = useRef(onBack)
  const onErrorRef = useRef(onError)
  const onClosedRef = useRef(onClosed)
  const getHardwareIdRef = useRef(getHardwareId)

  const stored = loadTerminal()
  const terminalName = stored?.pcName || stored?.hostname || machineId || 'CABIN-01'

  onBackRef.current = onBack
  onErrorRef.current = onError
  onClosedRef.current = onClosed
  getHardwareIdRef.current = getHardwareId

  // Live balance polling while provider game is active
  useEffect(() => {
    let cancelled = false

    async function syncBalance() {
      try {
        const hardwareId = await getHardwareIdRef.current()
        const session = await fetchSession(machineId, hardwareId)
        if (cancelled) return
        if (session && typeof session.current_balance === 'number') {
          useMachine.getState().setBalance(session.current_balance)
        }
      } catch {
        // silent fail during gameplay
      }
    }

    void syncBalance()
    const timer = window.setInterval(() => void syncBalance(), 2500)
    const onMessage = () => {
      void syncBalance()
    }
    window.addEventListener('message', onMessage)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('message', onMessage)
      void syncBalance()
    }
  }, [machineId])

  // Body active game lifecycle to hide home header
  useEffect(() => {
    document.body.classList.add('is-game-active')
    return () => {
      document.body.classList.remove('is-game-active')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function launch() {
      setLaunchError(null)
      setGameUrl(null)
      setIframeReady(false)
      try {
        if (disabled) {
          throw new Error('Terminal balance is zero. Please insert cash or scan a ticket first.')
        }
        const hardwareId = await getHardwareIdRef.current()
        const result = await launchProviderGame(machineId, hardwareId, game.id)
        if (cancelled) return
        setGameUrl(result.game_url)
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Game launch failed'
        setLaunchError(msg)
        onErrorRef.current(msg)
        onClosedRef.current()
        onBackRef.current()
      }
    }

    void launch()
    return () => {
      cancelled = true
    }
  }, [game.id, machineId, disabled, iframeKey])

  useEffect(() => {
    if (!gameUrl || iframeReady) return
    const timer = window.setTimeout(() => setIframeReady(true), IFRAME_REVEAL_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [gameUrl, iframeReady])

  function handleExit() {
    onClosed()
    onBack()
  }

  function handleReload() {
    setLaunchError(null)
    setIframeKey((prev) => prev + 1)
  }

  const providerName = (game.provider || (game.id.includes('SPRIBE') ? 'SPRIBE' : 'CASINO LIVE')).toUpperCase()

  return createPortal(
    <div className="game-launch-screen" style={{ backgroundColor: '#000000', colorScheme: 'dark' }}>
      <header className="game-launch-header">
        <div className="game-launch-header-left">
          <button type="button" className="game-launch-exit-btn" onClick={handleExit} title="Exit back to lobby">
            <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
            <span>EXIT GAME</span>
          </button>

          <div className="game-launch-divider" />

          <div className="game-launch-thumb-box">
            <img
              src={game.image || FALLBACK_PLACEHOLDER}
              alt={game.name}
              className="game-launch-thumb-img"
              onError={(e) => {
                const target = e.currentTarget
                if (target.src !== FALLBACK_PLACEHOLDER) {
                  target.src = FALLBACK_PLACEHOLDER
                }
              }}
            />
          </div>

          <div className="game-launch-title-wrap">
            <div className="game-launch-title-row">
              <h2 className="game-launch-name">{game.name}</h2>
              <span className="game-launch-provider-badge">{providerName}</span>
            </div>
            <div className="game-launch-meta-row">
              <span className="game-launch-live-tag">
                <span className="game-launch-pulse-dot" /> LIVE STREAM
              </span>
            </div>
          </div>
        </div>

        <div className="game-launch-header-center">
          <div className="game-launch-brand">
            <img className="brand-logo-img" src="/brand/betwise-logo.png" alt="Betwise" draggable={false} />
          </div>

          <div className="game-launch-station-capsule">
            <span className="game-launch-station-item">
              <i className="fa-solid fa-desktop text-cyan"></i>
              <span className="station-label">{terminalName}</span>
            </span>
          </div>
        </div>

        <div className="game-launch-header-right">
          <div className="game-launch-balance-pill">
            <div className="game-launch-balance-content">
              <span className="balance-label">BAL</span>
              <span className="balance-amount">{formatCurrency(displayBalance)}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="game-launch-body" style={{ background: '#000000', position: 'relative' }}>
        {launchError ? (
          <div className="game-launch-connecting" style={{ maxWidth: 440, margin: '0 auto', textAlign: 'center', padding: 24, zIndex: 20 }}>
            <i className="fa-solid fa-triangle-exclamation text-warning" style={{ fontSize: '2.5rem', marginBottom: 16 }} />
            <div className="game-launch-status-text" style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 800, marginBottom: 8 }}>
              Game Stream Unavailable
            </div>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: 20 }}>{launchError}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-winbet-modal-primary"
                onClick={handleReload}
                style={{ padding: '10px 20px', fontSize: '0.9rem' }}
              >
                <i className="fa-solid fa-rotate-right me-1.5" /> Retry Launch
              </button>
              <button
                type="button"
                className="btn-winbet-modal-secondary"
                onClick={handleExit}
                style={{ padding: '10px 20px', fontSize: '0.9rem' }}
              >
                Exit to Lobby
              </button>
            </div>
          </div>
        ) : (
          gameUrl && (
            <iframe
              key={iframeKey}
              className="game-launch-iframe"
              title={game.name}
              src={gameUrl}
              onLoad={() => setIframeReady(true)}
              allow="autoplay; fullscreen; payment; clipboard-read; clipboard-write; camera; microphone; geolocation"
              allowFullScreen
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: '#000000',
                colorScheme: 'dark',
                display: 'block',
                opacity: iframeReady ? 1 : 0,
                transition: 'opacity 180ms ease-out',
              }}
            />
          )
        )}
      </div>
    </div>,
    document.body
  )
}
