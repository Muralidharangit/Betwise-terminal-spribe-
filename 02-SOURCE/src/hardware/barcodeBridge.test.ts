import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarcodeListener } from './barcodeBridge'

vi.mock('../lib/uiLog', () => ({ uiLog: vi.fn() }))

function key(k: string, opts: Partial<KeyboardEventInit> & { target?: EventTarget } = {}) {
  const { target, ...init } = opts
  const ev = new KeyboardEvent('keydown', { key: k, code: init.code, bubbles: true, cancelable: true, ...init })
  ;(target ?? window).dispatchEvent(ev)
  return ev
}

function typeCode(code: string, terminator = 'Enter') {
  for (const ch of code) key(ch)
  key(terminator)
}

describe('barcode keyboard-wedge listener', () => {
  let onScan: (code: string) => void
  let onScanMock: ReturnType<typeof vi.fn<(code: string) => void>>
  let stop: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
    onScanMock = vi.fn<(code: string) => void>()
    onScan = onScanMock
    stop = createBarcodeListener(onScan)
  })
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('emits an upper-cased code on Enter', () => {
    typeCode('t1a2b3c4')
    expect(onScanMock).toHaveBeenCalledWith('T1A2B3C4')
  })

  it('emits on Tab terminator as well', () => {
    typeCode('T1A2B3C4', 'Tab')
    expect(onScanMock).toHaveBeenCalledWith('T1A2B3C4')
  })

  it('ignores codes shorter than 4 characters', () => {
    typeCode('T1')
    expect(onScanMock).not.toHaveBeenCalled()
  })

  it('ignores modifier keys and Shift while typing', () => {
    key('Shift')
    for (const ch of 'T1A2B3C4') key(ch, { shiftKey: true })
    key('Enter')
    expect(onScanMock).toHaveBeenCalledWith('T1A2B3C4')
  })

  it('resolves "Unidentified" keys from the physical key code (some scanners)', () => {
    key('Unidentified', { code: 'KeyT' })
    key('Unidentified', { code: 'Digit1' })
    key('Unidentified', { code: 'KeyA' })
    key('Unidentified', { code: 'Digit2' })
    key('Unidentified', { code: 'Numpad3' })
    key('Unidentified', { code: 'NumpadEnter' })
    expect(onScanMock).toHaveBeenCalledWith('T1A23')
  })

  it('does not double-credit the same code scanned twice within 1.2 s', () => {
    typeCode('T1A2B3C4')
    typeCode('T1A2B3C4')
    expect(onScanMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1300)
    typeCode('T1A2B3C4')
    expect(onScanMock).toHaveBeenCalledTimes(2)
  })

  it('drops a buffer when a human types slowly (gap > 400 ms)', () => {
    for (const ch of 'T1A2') {
      key(ch)
      vi.advanceTimersByTime(500)
    }
    key('B')
    key('3')
    key('C')
    key('4')
    key('Enter')
    // only "B3C4" survived, which is 4 chars → still emitted; a 3-char tail would not
    expect(onScanMock).toHaveBeenCalledWith('B3C4')
  })

  it('ignores keys typed into an input field', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    for (const ch of 'T1A2B3C4') key(ch, { target: input })
    key('Enter', { target: input })
    expect(onScanMock).not.toHaveBeenCalled()
    input.remove()
  })

  it('ignores Ctrl / Alt / Meta shortcuts', () => {
    for (const ch of 'T1A2B3C4') key(ch, { ctrlKey: true })
    key('Enter', { ctrlKey: true })
    expect(onScanMock).not.toHaveBeenCalled()
  })

  it('reports a wake miss when the first scan after idle arrives truncated', () => {
    const onWakeMiss = vi.fn<() => void>()
    stop()
    stop = createBarcodeListener(onScanMock, { onWakeMiss })
    typeCode('T1A2B3C4')
    vi.advanceTimersByTime(5000) // idle
    key('C')
    key('4')
    key('Enter')
    expect(onWakeMiss).toHaveBeenCalledTimes(1)
    expect(onScanMock).toHaveBeenCalledTimes(1)
  })

  it('prevents the Enter key from reaching the page while scanning', () => {
    for (const ch of 'T1A2B3C4') key(ch)
    const enter = key('Enter')
    expect(enter.defaultPrevented).toBe(true)
  })

  it('stops listening after the returned cleanup is called', () => {
    stop()
    typeCode('T1A2B3C4')
    expect(onScanMock).not.toHaveBeenCalled()
    stop = () => undefined
  })
})
