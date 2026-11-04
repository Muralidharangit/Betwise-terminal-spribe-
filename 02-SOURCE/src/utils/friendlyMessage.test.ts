import { describe, expect, it } from 'vitest'
import { deviceLabel, friendlyMessage, friendlyTitle, PLAIN } from './friendlyMessage'

const TECHNICAL = [/\\\\/, /\/dev\//, /sudo/, /USB00\d/i, /0x[0-9a-f]+/i, /\{|\}/, /undefined/, /TypeError/, /errno/i]

function expectPlain(text: string) {
  for (const re of TECHNICAL) expect(text).not.toMatch(re)
  expect(text.length).toBeGreaterThan(10)
  expect(text.length).toBeLessThanOrEqual(220)
}

describe('friendlyMessage — printer', () => {
  it('hides device path and OS hint from the old Rust message', () => {
    const out = friendlyMessage(
      "Printer not connected (\\\\.\\USB001). Check the USB cable and power. Windows: install the printer's driver (Epson, Xprinter, …) so it appears in Printers & scanners.",
    )
    expect(out).toBe(PLAIN.printerNotConnected)
    expectPlain(out)
  })

  it.each([
    ['Printer permission denied (/dev/usb/lp0). Run: sudo usermod -aG lp $USER then log out/in.', PLAIN.printerNoAccess],
    ['Printer error (/dev/usb/lp0): Input/output error (os error 5)', PLAIN.printerNotResponding],
    ['Cannot open printer "XP-Q851L". Check that it is installed and switched on.', PLAIN.printerNotConnected],
    ['Printer "EPSON TM-T88V" did not accept the ticket. Check paper and power.', PLAIN.printerNotResponding],
    ['Printer "EPSON" refused the job.', PLAIN.printerNotResponding],
    ['printer offline', PLAIN.printerNotConnected],
    ['Printer out of paper', PLAIN.printerNoPaper],
    ['The ticket printer cover is open. Close it, then try again.', PLAIN.printerCoverOpen],
    ['Printer only available in the terminal app', PLAIN.terminalOnly],
  ])('%s', (raw, expected) => {
    expect(friendlyMessage(raw)).toBe(expected)
  })

  it('keeps the new plain Rust messages unchanged', () => {
    for (const msg of [PLAIN.printerNotConnected, PLAIN.printerNoAccess, PLAIN.printerNotResponding]) {
      expect(friendlyMessage(msg)).toBe(msg)
    }
  })
})

describe('friendlyMessage — note reader', () => {
  it.each([
    ['NV10 not responding', PLAIN.noteReaderNotResponding],
    ['NV10 setup request failed', PLAIN.noteReaderNotResponding],
    ['NV10 cashbox full', PLAIN.noteReaderCashboxFull],
    ['NV10 note jammed', PLAIN.noteReaderJam],
    ['NV10 fraud attempt detected', PLAIN.noteReaderFraud],
    ['GBA ST2 not responding on ccTalk', PLAIN.noteReaderNotResponding],
    ['Permission denied opening COM3', PLAIN.noteReaderNoAccess],
    ['/dev/ttyUSB0: Device or resource busy', PLAIN.noteReaderNotResponding],
    ['serial port not found', PLAIN.noteReaderNotResponding],
  ])('%s', (raw, expected) => {
    expect(friendlyMessage(raw)).toBe(expected)
  })

  it('keeps the new plain Rust messages unchanged', () => {
    for (const msg of [
      PLAIN.noteReaderNotResponding,
      PLAIN.noteReaderCashboxFull,
      PLAIN.noteReaderJam,
      PLAIN.noteReaderFraud,
    ]) {
      expect(friendlyMessage(msg)).toBe(msg)
    }
  })
})

describe('friendlyMessage — tickets and balance', () => {
  it.each([
    ['Ticket already redeemed', PLAIN.ticketUsed],
    ['Ticket already used', PLAIN.ticketUsed],
    ['Ticket has been voided', PLAIN.ticketVoid],
    ['Ticket cancelled', PLAIN.ticketVoid],
    ['This ticket has been cancelled. Please ask the cashier.', PLAIN.ticketVoid],
    ['Ticket not found', PLAIN.ticketNotFound],
    ['Barcode not found', PLAIN.ticketNotFound],
    ['Not a credit ticket', PLAIN.ticketNotCredit],
    ['No balance to cash out', PLAIN.noBalance],
    ['Shop balance too low to restore ticket', PLAIN.shopLow],
    ['Shop coins too low', PLAIN.shopLow],
    ['Insufficient credit', PLAIN.notEnough],
    ['Insufficient balance', PLAIN.notEnough],
  ])('%s', (raw, expected) => {
    expect(friendlyMessage(raw)).toBe(expected)
  })

  it('does not call a missing game a missing ticket', () => {
    const out = friendlyMessage('Game not found')
    expect(out).not.toBe(PLAIN.ticketNotFound)
    expectPlain(out)
  })
})

describe('friendlyMessage — network, server, account', () => {
  it.each([
    ['TypeError: Failed to fetch', PLAIN.offline],
    ['Platform not reachable', PLAIN.offline],
    ['NetworkError when attempting to fetch resource.', PLAIN.offline],
    ['Load failed', PLAIN.offline],
    ['The ticket check is taking too long. Please ask the cashier.', PLAIN.slow],
    ['Request timed out', PLAIN.slow],
    ['Request failed (500)', PLAIN.server],
    ['Request failed (502)', PLAIN.server],
    ['Request failed (503)', PLAIN.server],
    ['Request failed (401)', PLAIN.notAllowed],
    ['Request failed (403)', PLAIN.notAllowed],
    ['Unauthorized', PLAIN.notAllowed],
    ['HARDWARE_MISMATCH', PLAIN.notAllowed],
    ['HARDWARE_UNBOUND', PLAIN.notAllowed],
    ['Terminal not hardware-bound', PLAIN.notAllowed],
    ['E_FAIL', PLAIN.generic],
    ['ERR_CONNECTION_REFUSED', PLAIN.offline],
    ['Request failed (422)', PLAIN.generic],
    ['Terminal is not registered', PLAIN.notRegistered],
  ])('%s', (raw, expected) => {
    expect(friendlyMessage(raw)).toBe(expected)
  })
})

describe('friendlyMessage — junk never reaches the screen', () => {
  it.each([
    'TypeError: Cannot read properties of undefined (reading "amount")',
    "Error invoking remote method 'print': Error: {\"code\":\"EACCES\"}",
    'Unexpected token < in JSON at position 0',
    'Error: something at Object.<anonymous> (file.js:1:1)',
    'x'.repeat(200),
    '',
    'undefined',
    '[object Object]',
  ])('%s', (raw) => {
    const out = friendlyMessage(raw)
    expect(out).toBe(PLAIN.generic)
  })

  it('accepts Error objects, strings, null and objects', () => {
    expect(friendlyMessage(new Error('Insufficient credit'))).toBe(PLAIN.notEnough)
    expect(friendlyMessage(null)).toBe(PLAIN.generic)
    expect(friendlyMessage(undefined)).toBe(PLAIN.generic)
    expect(friendlyMessage({})).toBe(PLAIN.generic)
    expect(friendlyMessage(42)).toBe(PLAIN.generic)
  })

  it('uses the given fallback for unknown errors', () => {
    expect(friendlyMessage(new Error('{bad}'), 'Custom fallback.')).toBe('Custom fallback.')
  })
})

describe('friendlyMessage — plain server sentences pass through', () => {
  it.each([
    'Your bet is below the minimum stake of N$ 1.00.',
    'Maximum stake is N$ 500.00.',
    'This game is closed for maintenance until 18:00.',
  ])('%s', (raw) => {
    expect(friendlyMessage(raw)).toBe(raw)
  })

  it('strips Error: and IPC wrappers before showing a sentence', () => {
    expect(friendlyMessage('Error: Your bet is below the minimum stake of N$ 1.00.')).toBe(
      'Your bet is below the minimum stake of N$ 1.00.',
    )
  })
})

describe('every PLAIN message is customer-safe', () => {
  it.each(Object.entries(PLAIN))('%s', (_key, text) => {
    expectPlain(text)
    expect(text.trim().endsWith('.')).toBe(true)
  })
})

describe('friendlyTitle / deviceLabel', () => {
  it('titles', () => {
    expect(friendlyTitle('ok')).toBe('Success')
    expect(friendlyTitle('warn')).toBe('Please note')
    expect(friendlyTitle('error')).toBe('Unable to continue')
    expect(friendlyTitle('error', 'Custom')).toBe('Custom')
  })
  it('device labels', () => {
    expect(deviceLabel('bill')).toBe('note reader')
    expect(deviceLabel('printer')).toBe('ticket printer')
    expect(deviceLabel('scanner')).toBe('ticket scanner')
    expect(deviceLabel('anything')).toBe('terminal')
  })
})
