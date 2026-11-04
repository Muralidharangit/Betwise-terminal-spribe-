import { useCredits } from '../hooks/useCredits';

export function BetStrip({
  bet,
  setBet,
  min = 5,
  max,
  symbol,
}: {
  bet: number;
  setBet: (n: number) => void;
  min?: number;
  max: number;
  symbol: string;
}) {
  const presets = [5, 10, 20, 50, 100].filter((v) => v <= Math.max(min, max));

  return (
    <div className="kx-betstrip">
      <div className="kx-betstrip-label">
        <span>Stake</span>
        <strong>
          {symbol}
          {bet.toFixed(2)}
        </strong>
      </div>
      <div className="kx-chip-row">
        {presets.map((v) => (
          <button
            key={v}
            type="button"
            className={`kx-chip ${bet === v ? 'active' : ''}`}
            onClick={() => setBet(v)}
            disabled={v > max}
          >
            {symbol}
            {v}
          </button>
        ))}
      </div>
      <input
        className="kx-range"
        type="range"
        min={min}
        max={Math.max(min, max)}
        step={5}
        value={Math.min(bet, Math.max(min, max))}
        onChange={(e) => setBet(Number(e.target.value))}
      />
    </div>
  );
}

export { useCredits };
