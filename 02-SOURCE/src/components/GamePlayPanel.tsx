import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency, placeBet, type BetResult } from '../api/client'
import { choiceLabel, type GameDefinition } from '../games/catalog'
import { loadTerminal } from '../lib/storage'

type Props = {
  game: GameDefinition
  machineId: string
  balance: number
  disabled: boolean
  onBack: () => void
  onBetComplete: (result: BetResult) => void
  onError: (message: string) => void
  getHardwareId: () => Promise<string>
}

const STAKES = [10, 25, 50, 100, 200] as const
const SPIN_MS = 1400
const FALLBACK_PLACEHOLDER = '/assets/img/placeholder.png'

function stageKind(gameId: string): 'roulette' | 'coin' | 'dice' | 'cards' | 'sport' | 'wheel' | 'number' {
  if (gameId === 'roulette') return 'roulette'
  if (gameId === 'coin_flip') return 'coin'
  if (gameId === 'dice_roll' || gameId === 'hi_lo') return 'dice'
  if (gameId === 'red_black' || gameId === 'card_suit') return 'cards'
  if (gameId === 'goal_kick') return 'sport'
  if (gameId === 'lucky_wheel') return 'wheel'
  return 'number'
}

function resultTone(game: GameDefinition, result: string): string {
  const base = result.split(' ')[0].toLowerCase()
  if (game.id === 'roulette' || game.id === 'red_black') return `tone-${base}`
  return 'tone-default'
}

export function GamePlayPanel({
  game,
  machineId,
  balance,
  disabled,
  onBack,
  onBetComplete,
  onError,
  getHardwareId,
}: Props) {
  const [stake, setStake] = useState<number>(50)
  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState<BetResult | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  const stored = loadTerminal()
  const terminalName = stored?.pcName || stored?.hostname || machineId || 'CABIN-01'

  // Body active game lifecycle to hide home header
  useEffect(() => {
    document.body.classList.add('is-game-active')
    return () => {
      document.body.classList.remove('is-game-active')
    }
  }, [])

  const kind = stageKind(game.id)

  async function handleBet(choice: string) {
    if (busy || disabled || balance < stake) return
    setBusy(true)
    setSpinning(true)
    setLastResult(null)
    setPicked(choice)

    const started = Date.now()
    try {
      const hardwareId = await getHardwareId()
      const result = await placeBet(machineId, hardwareId, game.id, choice, stake)
      const wait = Math.max(0, SPIN_MS - (Date.now() - started))
      if (wait > 0) await new Promise((r) => window.setTimeout(r, wait))
      setLastResult(result)
      onBetComplete(result)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Bet failed')
    } finally {
      setSpinning(false)
      setBusy(false)
    }
  }

  const canBet = !disabled && !busy && balance >= stake && balance >= 10
  const compactChoices = game.choices.length > 4
  const headline = spinning
    ? 'Drawing…'
    : lastResult
      ? lastResult.result.split(' ')[0]
      : game.icon

  return createPortal(
    <div
      className="game-launch-screen"
      style={
        {
          '--game-accent': game.accent,
          '--art-from': game.artFrom,
          '--art-to': game.artTo,
        } as CSSProperties
      }
    >
      <header className="game-launch-header">
        <div className="game-launch-header-left">
          <button type="button" className="game-launch-exit-btn" onClick={onBack} disabled={busy} title="Exit back to lobby">
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
              <span className="game-launch-provider-badge">BETWISE ORIGINAL</span>
            </div>
            <div className="game-launch-meta-row">
              <span className="game-launch-live-tag">
                <span className="game-launch-pulse-dot" /> LIVE CASINO
              </span>
              <span className="game-launch-payout-chip">PAYS {game.payout_label}</span>
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
              <span className="balance-amount">{formatCurrency(balance)}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="game-launch-body casino-table">
        <div className={`casino-stage kind-${kind} ${spinning ? 'is-spinning' : ''} ${lastResult ? (lastResult.won ? 'is-win' : 'is-loss') : ''}`}>
          <div className="casino-stage-ring" aria-hidden="true" />
          <div className={`casino-stage-core ${resultTone(game, lastResult?.result ?? '')}`}>
            <span className="casino-stage-value">{headline}</span>
            {!spinning && !lastResult ? <span className="casino-stage-hint">{game.tagline}</span> : null}
            {spinning ? <span className="casino-stage-hint">Good luck…</span> : null}
          </div>
        </div>

        {lastResult ? (
          <div className={`casino-result ${lastResult.won ? 'win' : 'loss'}`}>
            <p className="casino-result-title">{lastResult.won ? 'You won!' : 'Not this time'}</p>
            <p className="casino-result-msg">{lastResult.message}</p>
            {lastResult.won ? (
              <p className="casino-result-pay">
                {lastResult.multiplier}× · {formatCurrency(lastResult.payout)}
              </p>
            ) : null}
            <p className="casino-result-round">Round {lastResult.round_id}</p>
          </div>
        ) : null}

        <div className="casino-stake">
          <span className="casino-stake-label">Your stake</span>
          <div className="casino-stake-row">
            {STAKES.map((amount) => (
              <button
                key={amount}
                type="button"
                className={`casino-chip ${stake === amount ? 'active' : ''}`}
                disabled={disabled || balance < amount}
                onClick={() => setStake(amount)}
              >
                {amount}
              </button>
            ))}
          </div>
        </div>

        <div className={`casino-choices ${compactChoices ? 'compact' : ''}`}>
          {game.choices.map((choice) => (
            <button
              key={choice}
              type="button"
              className={`casino-choice choice-${choice.toLowerCase()} ${picked === choice && spinning ? 'picked' : ''}`}
              disabled={!canBet}
              onClick={() => void handleBet(choice)}
            >
              {choiceLabel(choice)}
            </button>
          ))}
        </div>

        {balance < stake && balance >= 10 ? (
          <p className="bet-hint">Lower your stake — balance is {formatCurrency(balance)}.</p>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
