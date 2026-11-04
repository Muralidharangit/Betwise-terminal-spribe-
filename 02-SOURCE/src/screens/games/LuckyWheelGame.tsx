import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BetStrip } from '../../components/BetStrip'
import { useCredits } from '../../hooks/useCredits'

const SEGMENTS = [
  { label: '1.5×', mult: 1.5, color: '#2a2a2a' },
  { label: '2×', mult: 2, color: '#3a2f12' },
  { label: '0', mult: 0, color: '#1a1a1a' },
  { label: '3×', mult: 3, color: '#3a2f12' },
  { label: '1.2×', mult: 1.2, color: '#2a2a2a' },
  { label: '5×', mult: 5, color: '#4a3810' },
  { label: '0', mult: 0, color: '#1a1a1a' },
  { label: '10×', mult: 10, color: '#5a4214' },
]

export default function LuckyWheelGame() {
  const navigate = useNavigate()
  const { balance, symbol, debit, win, toast } = useCredits()
  const [bet, setBet] = useState(10)
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [result, setResult] = useState('')

  useEffect(() => {
    document.body.classList.add('is-game-active')
    return () => {
      document.body.classList.remove('is-game-active')
    }
  }, [])

  const gradient = useMemo(() => {
    const slice = 100 / SEGMENTS.length
    return SEGMENTS.map((s, i) => `${s.color} ${i * slice}% ${(i + 1) * slice}%`).join(', ')
  }, [])

  async function spin() {
    if (spinning) return
    const stake = Math.min(bet, balance)
    if (stake < 5) {
      toast('warn', 'Not enough balance for that stake.')
      return
    }

    try {
      // Debit first, then animate — stay on this screen even if balance hits 0
      await debit(stake)
      setSpinning(true)
      setResult('')
      const index = Math.floor(Math.random() * SEGMENTS.length)
      const slice = 360 / SEGMENTS.length
      const target =
        360 * 6 + (360 - index * slice - slice / 2) + (Math.random() * slice * 0.4 - slice * 0.2)
      setRotation((prev) => prev + target)

      window.setTimeout(() => {
        void (async () => {
          try {
            const seg = SEGMENTS[index]
            const payout = Number((stake * seg.mult).toFixed(2))
            if (payout > 0) await win(payout)
            setResult(
              seg.mult === 0
                ? `Landed on 0 · Lost ${symbol}${stake.toFixed(2)}`
                : `Landed on ${seg.label} · Won ${symbol}${payout.toFixed(2)}`,
            )
            toast(seg.mult > 0 ? 'ok' : 'warn', seg.mult > 0 ? 'Nice spin' : 'Try again')
          } catch (err) {
            toast('error', String(err).replace(/^Error:\s*/, ''))
          } finally {
            setSpinning(false)
          }
        })()
      }, 4200)
    } catch (err) {
      toast('error', String(err).replace(/^Error:\s*/, ''))
      setSpinning(false)
    }
  }

  return (
    <main className="screen screen--arena-fit kx-gamepage kx-gamepage-fit">
      <header className="kx-gamepage-top">
        <button
          type="button"
          className="kx-btn kx-btn-ghost kx-btn-sm"
          onClick={() => navigate('/play')}
          disabled={spinning}
        >
          ← Games
        </button>
        <div className="kx-lobby-credit">
          <span>Balance</span>
          <strong>
            {symbol}
            {balance.toFixed(2)}
          </strong>
        </div>
      </header>

      <div className="kx-game-stage">
        <div className="kx-game-copy">
          <h1>Lucky Wheel</h1>
          <p className="kx-sub">Spin once per stake. Multipliers pay under the pointer.</p>
        </div>
        <div className="kx-wheel-wrap">
          <div className="kx-wheel-pointer" />
          <div
            className={`kx-wheel ${spinning ? 'is-spinning' : ''}`}
            style={{
              background: `conic-gradient(${gradient})`,
              transform: `rotate(${rotation}deg)`,
            }}
          >
            {SEGMENTS.map((s, i) => (
              <span
                key={`${s.label}-${i}`}
                className="kx-wheel-label"
                style={{
                  transform: `rotate(${i * (360 / SEGMENTS.length) + 360 / SEGMENTS.length / 2}deg)`,
                }}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="kx-game-dock">
        {result ? <div className="kx-result">{result}</div> : null}
        {balance < 5 && !spinning ? (
          <p className="kx-sub" style={{ textAlign: 'center', marginBottom: 8 }}>
            Credit empty — insert cash or go Home to continue.
          </p>
        ) : null}
        <BetStrip bet={bet} setBet={setBet} max={Math.max(balance, 5)} symbol={symbol} />
        <button
          type="button"
          className="kx-btn kx-btn-primary kx-btn-block"
          onClick={() => void spin()}
          disabled={spinning || balance < 5}
        >
          {spinning ? 'Spinning…' : 'Spin wheel'}
        </button>
      </div>
    </main>
  )
}
