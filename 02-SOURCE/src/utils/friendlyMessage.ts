/**
 * Turn any error (API, printer, note reader, scanner, network, code bug) into one
 * short line a customer or cashier can understand.
 *
 * Rules:
 *  - plain words only: "ticket printer", "note reader", "cashier", "support"
 *  - never show device paths, port names, commands, error codes or stack traces
 *  - every message says what happened and what to do next
 */

const TECHNICAL_MARKERS = [
  '\\\\',          // \\.\USB001
  '/dev/',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'usb00',
  'sudo ',
  'usermod',
  'errno',
  'enoent',
  'eacces',
  'eperm',
  'econn',
  'etimedout',
  '0x',
  'exception',
  'undefined',
  'stack trace',
  'http://',
  'https://',
  'json',
  'cctalk',
  'escpos',
  'esc/pos',
  'nv10',
  'gba st2',
  'spool',
  'win32',
  'hresult',
  'os error',
  'invoke',
  'promise',
  'typeerror',
  'referenceerror',
  'syntaxerror',
  '{',
  '}',
  '<',
  '>',
]

export const PLAIN = {
  generic: 'Something went wrong. Please try again, or ask the cashier.',
  offline: 'This terminal cannot reach the server right now. Please ask the cashier to check the internet connection.',
  slow: 'The connection is slow right now. Please wait a moment and try again.',
  server: 'The server is having a problem right now. Please try again in a minute, or ask the cashier.',
  notAllowed: 'This terminal is not allowed to do that. Please ask the cashier.',
  notRegistered: 'This terminal is not set up yet. Please ask the cashier.',
  printerNotConnected:
    'The ticket printer is not connected. Check that it is switched on and the USB cable is plugged in, then try again.',
  printerNoAccess: 'This terminal is not allowed to use the ticket printer. Please call support.',
  printerNotResponding:
    'The ticket printer is not responding. Check the paper roll and that the printer is switched on, then try again.',
  printerNoPaper: 'The ticket printer is out of paper. Please ask the cashier to load a new roll.',
  printerCoverOpen: 'The ticket printer cover is open. Please ask the cashier to close it.',
  noteReaderNotResponding: 'The note reader is not responding. Please do not insert cash. Call the cashier.',
  noteReaderNoAccess: 'This terminal is not allowed to use the note reader. Please call support.',
  noteReaderCashboxFull: 'The cash box is full, so no more notes can be taken. Please call the cashier.',
  noteReaderJam: 'A note is stuck in the note reader. Please do not insert more cash. Call the cashier.',
  noteReaderFraud: 'The note reader rejected a suspicious note and has paused. Please call the cashier.',
  scannerNotWorking: 'The ticket scanner is not working. Unplug its cable, plug it back in, and try again.',
  ticketVoid: 'This ticket has already been redeemed. Please ask the cashier.',
  ticketUsed: 'This ticket has already been redeemed. Please ask the cashier.',
  ticketNotFound: 'We could not find this ticket. Check the barcode or ask the cashier.',
  ticketNotCredit: 'This is not a cash-out ticket. Insert cash, or scan a cash-out ticket.',
  noBalance: 'There is no balance to cash out. Insert cash or scan a ticket first.',
  shopLow: 'The shop balance is too low right now. Please ask the cashier.',
  notEnough: 'Not enough balance for that bet.',
  cashOutPrinter: 'Cash-out was cancelled because the ticket could not be printed. Your balance stays on this terminal.',
  terminalOnly: 'This only works on the terminal.',
} as const

function stripWrappers(raw: string): string {
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^(Error|TerminalApiError|TypeError):\s*/i, '')
    .replace(/^(Error|TerminalApiError|TypeError):\s*/i, '')
    .trim()
}

function looksTechnical(text: string): boolean {
  const lower = text.toLowerCase()
  return TECHNICAL_MARKERS.some((m) => lower.includes(m))
}

/** Map a raw error text to a plain message, or null if no rule matches. */
function matchPlain(lower: string): string | null {
  // ---- Printer ----
  if (lower.includes('printer') || lower.includes('print ')) {
    if (lower.includes('out of paper') || lower.includes('no paper') || lower.includes('paper end'))
      return PLAIN.printerNoPaper
    if (lower.includes('cover is open') || lower.includes('cover open')) return PLAIN.printerCoverOpen
    if (lower.includes('permission') || lower.includes('not allowed') || lower.includes('access'))
      return PLAIN.printerNoAccess
    if (
      lower.includes('not connected') ||
      lower.includes('not found') ||
      lower.includes('offline') ||
      lower.includes('no writable') ||
      lower.includes('cannot open') ||
      lower.includes('unplugged')
    )
      return PLAIN.printerNotConnected
    if (lower.includes('only available in the terminal app')) return PLAIN.terminalOnly
    if (
      lower.includes('not responding') ||
      lower.includes('refused') ||
      lower.includes('did not accept') ||
      lower.includes('error') ||
      lower.includes('failed') ||
      lower.includes('could not print')
    )
      return PLAIN.printerNotResponding
  }

  // ---- Note reader (bill acceptor) ----
  if (
    lower.includes('note reader') ||
    lower.includes('bill acceptor') ||
    lower.includes('nv10') ||
    lower.includes('gba') ||
    lower.includes('validator') ||
    lower.includes('cctalk') ||
    lower.includes('ssp')
  ) {
    if (lower.includes('full')) return PLAIN.noteReaderCashboxFull
    if (lower.includes('jam') || lower.includes('stuck')) return PLAIN.noteReaderJam
    if (lower.includes('fraud') || lower.includes('suspicious')) return PLAIN.noteReaderFraud
    if (lower.includes('permission') || lower.includes('not allowed') || lower.includes('access'))
      return PLAIN.noteReaderNoAccess
    return PLAIN.noteReaderNotResponding
  }

  // ---- Scanner ----
  if (lower.includes('scanner') && !lower.includes('waking')) return PLAIN.scannerNotWorking

  // ---- Serial / USB port problems with no device named (the note reader is the only serial device) ----
  if (
    lower.includes('serial') ||
    /\bcom\d+\b/.test(lower) ||
    lower.includes('/dev/tty') ||
    lower.includes('/dev/serial')
  ) {
    if (lower.includes('permission') || lower.includes('access denied')) return PLAIN.noteReaderNoAccess
    return PLAIN.noteReaderNotResponding
  }

  // ---- Tickets / balance ----
  const aboutTicket = lower.includes('ticket') || lower.includes('barcode')
  if (
    lower.includes('voided') ||
    (aboutTicket && lower.includes('void')) ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    (aboutTicket && lower.includes('cancel'))
  )
    return PLAIN.ticketVoid
  if (lower.includes('already used') || lower.includes('already redeemed') || lower.includes('already paid'))
    return PLAIN.ticketUsed
  if (lower.includes('not a credit ticket') || lower.includes('ignored')) return PLAIN.ticketNotCredit
  if (lower.includes('ticket not found') || (aboutTicket && lower.includes('not found'))) return PLAIN.ticketNotFound
  if (lower.includes('no balance')) return PLAIN.noBalance
  if (
    lower.includes('too low to restore') ||
    lower.includes('shop balance') ||
    lower.includes('shop coins') ||
    lower.includes('float')
  )
    return PLAIN.shopLow
  if (lower.includes('insufficient') || lower.includes('not enough')) return PLAIN.notEnough

  // ---- Terminal / account ----
  if (lower.includes('not registered') || lower.includes('unregistered')) return PLAIN.notRegistered
  if (
    lower.includes('hardware_mismatch') ||
    lower.includes('hardware_unbound') ||
    lower.includes('hardware-bound') ||
    lower.includes('unauthori') ||
    lower.includes('forbidden') ||
    lower.includes('request failed (401') ||
    lower.includes('request failed (403') ||
    lower.includes('device_fingerprint') ||
    lower.includes('fingerprint')
  )
    return PLAIN.notAllowed

  // ---- Network / server ----
  if (
    lower.includes('platform not reachable') ||
    lower.includes('fetch failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('network') ||
    lower.includes('offline') ||
    lower.includes('connection refused') ||
    lower.includes('connection_refused') ||
    lower.includes('connection reset') ||
    lower.includes('connection_reset') ||
    lower.includes('name_not_resolved') ||
    lower.includes('internet_disconnected') ||
    lower.includes('could not connect') ||
    lower.includes('dns') ||
    lower.includes('econn')
  )
    return PLAIN.offline
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('taking too long'))
    return PLAIN.slow
  if (
    /request failed \(5\d\d\)/.test(lower) ||
    lower.includes('server error') ||
    lower.includes('internal server') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable') ||
    lower.includes('gateway timeout')
  )
    return PLAIN.server
  if (/request failed \(\d{3}\)/.test(lower)) return PLAIN.generic

  return null
}

/** One plain line for any error. `fallback` is used when nothing better is known. */
export function friendlyMessage(err: unknown, fallback: string = PLAIN.generic): string {
  let raw = ''
  if (err instanceof Error) raw = err.message
  else raw = String(err ?? '')
  raw = stripWrappers(raw)

  if (!raw || raw === 'undefined' || raw === '[object Object]') return fallback

  const plain = matchPlain(raw.toLowerCase())
  if (plain) return plain

  // Already a short human sentence from our own code or the server? Show it.
  // Must contain real words (at least one letter and a space or sentence ending) —
  // bare codes like "42", "E_FAIL" or "HARDWARE_MISMATCH" are not sentences.
  const looksLikeSentence = /[a-z]/i.test(raw) && (/\s/.test(raw) || /[.!?]$/.test(raw)) && !/^[A-Z0-9_\-:]+$/.test(raw)
  if (raw.length <= 160 && looksLikeSentence && !looksTechnical(raw)) return raw

  // Anything else (stack trace, path, code) is hidden from the screen.
  return fallback
}

export function friendlyTitle(tone: 'ok' | 'warn' | 'error', hint?: string): string {
  if (hint) return hint
  if (tone === 'ok') return 'Success'
  if (tone === 'warn') return 'Please note'
  return 'Unable to continue'
}

/** Plain name for a hardware device key used in `hardware-error` events. */
export function deviceLabel(device: string): string {
  switch (device) {
    case 'bill':
      return 'note reader'
    case 'printer':
      return 'ticket printer'
    case 'scanner':
      return 'ticket scanner'
    default:
      return 'terminal'
  }
}
