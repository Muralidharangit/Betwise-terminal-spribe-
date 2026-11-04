import { describe, expect, it, vi } from 'vitest'
import { code128Svg, downloadDemoTicket } from './demoTicket'

describe('code128Svg (demo ticket barcode)', () => {
  it('renders a valid SVG with bars for a 9-char ticket code', () => {
    const svg = code128Svg('T1A2B3C4D')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('aria-label="T1A2B3C4D"')
    const bars = svg.match(/<rect/g)?.length ?? 0
    // start + 9 data + checksum + stop = 12 symbols, each has 3 bars (stop has 4)
    expect(bars).toBe(12 * 3 + 1)
  })

  it('width grows with the code length and includes quiet zones', () => {
    const short = code128Svg('ABCD')
    const long = code128Svg('ABCDEFGHIJKL')
    const w = (s: string) => Number(s.match(/width="(\d+)"/)?.[1])
    expect(w(long)).toBeGreaterThan(w(short))
    expect(w(short)).toBeGreaterThan(20)
  })

  it('rejects characters a scanner could not read back', () => {
    expect(() => code128Svg('T1A2\u00e9')).toThrow(/unsupported characters/)
    expect(() => code128Svg('T1\n')).toThrow(/unsupported characters/)
  })
})

describe('downloadDemoTicket', () => {
  it('creates an HTML file named after the barcode', () => {
    const createObjectURL = vi.fn(() => 'blob:ticket')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const clicks: string[] = []
    const origClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.download)
    }
    try {
      downloadDemoTicket({ barcode: 'T1A2B3C4D', amount: 170, currencySymbol: 'N$', kioskName: 'CABIN-01' })
      expect(clicks).toEqual(['ticket-T1A2B3C4D.html'])
      const firstCall = createObjectURL.mock.calls[0] as unknown as [Blob] | undefined
      const blob = firstCall?.[0]
      expect(blob?.type).toContain('text/html')
    } finally {
      HTMLAnchorElement.prototype.click = origClick
    }
  })
})
