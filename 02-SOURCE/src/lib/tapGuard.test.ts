import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { blockTapsBriefly } from './tapGuard'

describe('tap guard (touch-screen ghost click)', () => {
  let now = 1000
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })
  afterEach(() => {
    now += 10_000 // make sure any block window from a previous test has expired
  })

  function click(target: HTMLElement) {
    const handler = vi.fn()
    target.addEventListener('click', handler)
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    target.dispatchEvent(ev)
    target.removeEventListener('click', handler)
    return { reached: handler.mock.calls.length > 0, prevented: ev.defaultPrevented }
  }

  it('swallows clicks for 700 ms after a pop-up closes, then lets them through', () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)

    blockTapsBriefly()
    expect(click(btn)).toEqual({ reached: false, prevented: true })

    now += 699
    expect(click(btn).reached).toBe(false)

    now += 2
    expect(click(btn)).toEqual({ reached: true, prevented: false })
    btn.remove()
  })

  it('accepts a custom duration', () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    blockTapsBriefly(100)
    now += 101
    expect(click(btn).reached).toBe(true)
    btn.remove()
  })
})
