/**
 * Touch screens can deliver a second (emulated) click after a tap. When a pop-up closes on
 * the first click, that second click lands on whatever is underneath — e.g. a game card.
 * Swallow every tap for a short moment after a pop-up closes.
 */
const EVENTS = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'] as const
const DEFAULT_MS = 700

let blockUntil = 0
let installed = false

function swallow(e: Event) {
  if (performance.now() > blockUntil) return
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
}

export function blockTapsBriefly(ms = DEFAULT_MS) {
  blockUntil = performance.now() + ms
  if (installed) return
  installed = true
  for (const type of EVENTS) {
    window.addEventListener(type, swallow, { capture: true, passive: false })
  }
}
