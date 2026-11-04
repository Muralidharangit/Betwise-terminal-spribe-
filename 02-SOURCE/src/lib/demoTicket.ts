/** Compact CODE128-B patterns (values 0–106). Last entry is STOP (13 modules). */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

export type DemoTicket = {
  barcode: string
  amount: number
  currencySymbol: string
  kioskName: string
  issuedAt?: string
}

function code128Values(text: string): number[] {
  const START_B = 104
  const STOP = 106
  const values = [START_B]
  let checksum = START_B
  for (let i = 0; i < text.length; i += 1) {
    const value = text.charCodeAt(i) - 32
    if (value < 0 || value > 94) {
      throw new Error('Ticket barcode has unsupported characters')
    }
    values.push(value)
    checksum += value * (i + 1)
  }
  values.push(checksum % 103)
  values.push(STOP)
  return values
}

export function code128Svg(text: string, height = 72): string {
  const values = code128Values(text)
  const quiet = 10
  let x = quiet
  const bars: string[] = []
  for (const value of values) {
    const pattern = PATTERNS[value]
    if (!pattern) continue
    let bar = true
    for (const ch of pattern) {
      const w = Number(ch)
      if (bar) {
        bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="#111"/>`)
      }
      x += w
      bar = !bar
    }
  }
  const width = x + quiet
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${text}">${bars.join('')}</svg>`
}

function ticketHtml(ticket: DemoTicket): string {
  const when = ticket.issuedAt || new Date().toLocaleString()
  const amount = `${ticket.currencySymbol}${ticket.amount.toFixed(2)}`
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Ticket ${ticket.barcode}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #e8e8e8; margin: 24px; }
    .ticket { width: 320px; margin: 0 auto; background: #fff; padding: 20px 18px 24px; border: 1px dashed #999; }
    h1 { font-size: 14px; letter-spacing: 0.12em; text-align: center; margin: 0 0 4px; }
    .sub { text-align: center; color: #666; font-size: 11px; margin: 0 0 16px; }
    .amount { text-align: center; font-size: 28px; font-weight: 800; margin: 8px 0 16px; }
    .barcode { display: flex; justify-content: center; overflow: hidden; }
    .code { text-align: center; font-family: ui-monospace, monospace; font-size: 15px; letter-spacing: 0.14em; margin: 10px 0 0; font-weight: 700; }
    .meta { margin-top: 16px; font-size: 12px; color: #444; line-height: 1.5; }
    .demo { margin-top: 14px; text-align: center; font-size: 10px; color: #888; }
  </style>
</head>
<body>
  <div class="ticket">
    <h1>BETWISE TERMINAL</h1>
    <p class="sub">Cash-out ticket</p>
    <div class="amount">${amount}</div>
    <div class="barcode">${code128Svg(ticket.barcode)}</div>
    <p class="code">${ticket.barcode}</p>
    <div class="meta">
      Kiosk: ${ticket.kioskName}<br/>
      Issued: ${when}
    </div>
    <p class="demo">Demo ticket — scan or paste this code on any terminal in the same portal.</p>
  </div>
</body>
</html>`
}

export function downloadDemoTicket(ticket: DemoTicket): void {
  const blob = new Blob([ticketHtml(ticket)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `ticket-${ticket.barcode}.html`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
