import { describe, expect, it } from 'vitest'
import { GAME_CATALOG, getGameById, SPRIBE_CATALOG_GAMES } from '../games/catalog'
import { useMachine } from '../services/sessionStore'
import { friendlyMessage, PLAIN } from '../utils/friendlyMessage'

function elapsed(fn: () => void): number {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

describe('hot-path performance budgets', () => {
  it('maps 2 000 raw errors in under 150 ms', () => {
    const samples = [
      'Printer not connected (\\\\.\\USB001). Check the USB cable.',
      'NV10 not responding',
      'Ticket already redeemed',
      'TypeError: Failed to fetch',
      'Request failed (500)',
      'Your bet is below the minimum stake of N$ 1.00.',
    ]
    // Warm the JIT so the budget is not a first-hit compile spike.
    for (let i = 0; i < 50; i++) friendlyMessage(samples[i % samples.length])
    const ms = elapsed(() => {
      for (let i = 0; i < 2000; i++) friendlyMessage(samples[i % samples.length])
    })
    expect(ms).toBeLessThan(150)
    expect(friendlyMessage(samples[0])).toBe(PLAIN.printerNotConnected)
  })

  it('looks up every lobby game 500 times in under 40 ms', () => {
    const ids = SPRIBE_CATALOG_GAMES.map((g) => g.id)
    expect(ids.length).toBeGreaterThanOrEqual(13)
    const ms = elapsed(() => {
      for (let i = 0; i < 500; i++) {
        for (const id of ids) {
          if (!getGameById(id)) throw new Error(id)
        }
      }
    })
    expect(ms).toBeLessThan(40)
    expect(GAME_CATALOG.length).toBeGreaterThan(20)
  })

  it('updates the balance 500 times in under 80 ms', () => {
    const setBalance = useMachine.getState().setBalance
    const ms = elapsed(() => {
      for (let i = 0; i < 500; i++) setBalance(i % 200)
    })
    expect(ms).toBeLessThan(80)
    expect(useMachine.getState().balance).toBe(99)
  })
})
