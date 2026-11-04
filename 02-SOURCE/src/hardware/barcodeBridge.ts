import { uiLog } from '../lib/uiLog'

/**
 * Keyboard-wedge barcode capture (Zebex / Ultrascan HID).
 * Port of Electron barcodeWedge.ts — handles idle wake gaps and Shift.
 */

export type WedgeOptions = {
  minLength?: number
  maxGapMs?: number
  idleGapMs?: number
  idleAfterMs?: number
  onScan: (code: string) => void
  onWakeMiss?: () => void
}

function createWedgeScanner(options: WedgeOptions) {
  const minLength = options.minLength ?? 4
  const maxGapMs = options.maxGapMs ?? 400
  const idleGapMs = options.idleGapMs ?? 600
  const idleAfterMs = options.idleAfterMs ?? 3000

  let buffer = ''
  let lastPrintableAt = 0
  let lastActivityAt = 0
  let lastEmitted = ''
  let lastEmittedAt = 0
  let wakeWindowUntil = 0

  function isModifier(key: string) {
    return key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta'
  }

  function resolveKey(raw: string, code?: string): string {
    if (raw && raw !== 'Unidentified' && raw !== 'Process') return raw
    if (!code) return raw || ''
    if (code === 'Enter' || code === 'NumpadEnter') return 'Enter'
    if (code === 'Tab') return 'Tab'
    if (code.startsWith('Key') && code.length === 4) return code.slice(3)
    if (code.startsWith('Digit') && code.length === 6) return code.slice(5)
    if (code.startsWith('Numpad') && code.length === 7 && /\d/.test(code.slice(6))) {
      return code.slice(6)
    }
    return raw || ''
  }

  function gapLimit(now: number) {
    if (now < wakeWindowUntil) return idleGapMs
    if (lastActivityAt && now - lastActivityAt >= idleAfterMs) return idleGapMs
    return maxGapMs
  }

  function pushKey(key: string, code?: string): 'ignored' | 'char' | 'emit' | 'reset' | 'wake_miss' {
    const k = resolveKey(key, code)
    if (!k || isModifier(k)) return 'ignored'

    const now = Date.now()
    if (lastActivityAt && now - lastActivityAt >= idleAfterMs) {
      wakeWindowUntil = now + 2500
    }

    const limit = gapLimit(now)
    if (lastPrintableAt && now - lastPrintableAt > limit) {
      if (buffer.length >= minLength) uiLog(`scan_buffer_dropped chars=${buffer.length} gap_ms=${now - lastPrintableAt}`, 'warn')
      buffer = ''
    }

    if (k === 'Enter' || k === 'Tab') {
      const scanned = buffer.trim().toUpperCase()
      buffer = ''
      lastPrintableAt = 0
      lastActivityAt = now

      if (scanned.length < minLength) {
        if (now < wakeWindowUntil) {
          uiLog(`scan_wake_miss chars=${scanned.length}`, 'warn')
          options.onWakeMiss?.()
          return 'wake_miss'
        }
        if (scanned.length > 0) uiLog(`scan_too_short chars=${scanned.length}`, 'warn')
        return 'reset'
      }

      if (scanned === lastEmitted && now - lastEmittedAt < 1200) {
        uiLog(`scan_duplicate_ignored code=${scanned}`, 'warn')
        return 'ignored'
      }
      uiLog(`scan_read code=${scanned}`)
      lastEmitted = scanned
      lastEmittedAt = now
      wakeWindowUntil = 0
      options.onScan(scanned)
      return 'emit'
    }

    if (k.length === 1) {
      lastPrintableAt = now
      lastActivityAt = now
      buffer += k
      return 'char'
    }

    return 'ignored'
  }

  return { pushKey }
}

/** Attach window keydown listener for HID barcode scanners. */
export function createBarcodeListener(
  onScan: (code: string) => void,
  options?: { minLength?: number; onWakeMiss?: () => void },
) {
  const wedge = createWedgeScanner({
    minLength: options?.minLength ?? 4,
    onScan,
    onWakeMiss: options?.onWakeMiss,
  })

  const handler = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return

    const target = e.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return
    }

    const result = wedge.pushKey(e.key, e.code)
    if (result !== 'ignored' || e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  window.addEventListener('keydown', handler, true)
  return () => window.removeEventListener('keydown', handler, true)
}
