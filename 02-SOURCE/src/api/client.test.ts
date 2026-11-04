import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPortalSlug, getPortalSlug, getShopApiBaseUrl, setPortalSlug } from '../config/env'
import {
  billIn,
  cancelCashOutTicket,
  cashOutTicket,
  fetchProviders,
  fetchSession,
  formatCurrency,
  isHardwareUnauthorized,
  launchProviderGame,
  registerTerminal,
  sendHeartbeat,
  TerminalApiError,
  ticketIn,
} from './client'

type Json = Record<string, unknown>

function jsonResponse(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  clearPortalSlug()
  setPortalSlug('betwise')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  clearPortalSlug()
})

function lastRequest(): { url: string; init: RequestInit; body: Json } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  const body = init?.body ? (JSON.parse(String(init.body)) as Json) : {}
  return { url, init, body }
}

describe('portal slug and base URL', () => {
  it('builds the shop API path from the portal slug', () => {
    expect(getShopApiBaseUrl('betwise')).toMatch(/\/api\/v1\/betwise\/shop$/)
    expect(getShopApiBaseUrl('shop one')).toMatch(/\/v1\/shop%20one\/shop$/)
  })
  it('uses a visible placeholder when no slug is known', () => {
    clearPortalSlug()
    expect(getShopApiBaseUrl('')).toMatch(/\/v1\/_unset_\/shop$/)
  })
  it('ignores blank slugs', () => {
    setPortalSlug('   ')
    expect(getPortalSlug()).toBe('betwise')
  })
})

describe('registerTerminal', () => {
  it('posts token + fingerprint and normalises the response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        message: 'Registered',
        data: { machine_id: 'B1-TM-001', terminal_name: 'CABIN-01', shop_id: 7, shop_name: 'Shop B1', status: 'ACTIVE' },
      }),
    )
    const r = await registerTerminal({
      registration_token: ' abcd1234 ',
      device_fingerprint: 'HW-1',
      operating_system: 'Windows',
      portal_slug: 'betwise',
    })
    const { url, body } = lastRequest()
    expect(url).toMatch(/\/v1\/betwise\/shop\/terminals\/register$/)
    expect(body).toMatchObject({ registration_token: ' abcd1234 ', device_fingerprint: 'HW-1', operating_system: 'Windows' })
    expect(r).toMatchObject({
      machine_id: 'B1-TM-001',
      pc_name: 'CABIN-01',
      hostname: 'CABIN-01',
      site_id: 7,
      site_name: 'Shop B1',
      status: 'ACTIVE',
      portal_slug: 'betwise',
      registration_token: 'ABCD1234',
    })
  })

  it('surfaces the first validation error from Laravel', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, message: 'The given data was invalid.', errors: { registration_token: ['Registration token is invalid or already used.'] } },
        422,
      ),
    )
    await expect(
      registerTerminal({ registration_token: 'x', device_fingerprint: 'HW', operating_system: 'Linux', portal_slug: 'betwise' }),
    ).rejects.toMatchObject({ name: 'TerminalApiError', status: 422, message: 'Registration token is invalid or already used.' })
  })

  it('fails cleanly when the server says success=false with 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, message: 'Shop is closed' }))
    await expect(
      registerTerminal({ registration_token: 'x', device_fingerprint: 'HW', operating_system: 'Linux', portal_slug: 'betwise' }),
    ).rejects.toThrow('Shop is closed')
  })
})

describe('fetchSession / heartbeat', () => {
  it('returns the balance and remembers a portal slug sent by the server', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { machine_id: 'B1-TM-001', terminal_name: 'CABIN-01', shop_name: 'Shop B1', site_id: 1, status: 'ACTIVE', current_balance: 150, loaded_amount: 200, portal_slug: 'newslug' },
      }),
    )
    const s = await fetchSession('B1-TM-001', 'HW')
    expect(lastRequest().url).toContain('machine_id=B1-TM-001')
    expect(lastRequest().url).toContain('device_fingerprint=HW')
    expect(s.current_balance).toBe(150)
    expect(s.pc_name).toBe('CABIN-01')
    expect(s.site_name).toBe('Shop B1')
    expect(getPortalSlug()).toBe('newslug')
  })

  it('reads a balance sent as a decimal string', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { machine_id: 'B1-TM-001', terminal_name: 'CABIN-01', site_id: 1, status: 'ACTIVE', current_balance: '100.00', loaded_amount: 0 },
      }),
    )
    const s = await fetchSession('B1-TM-001', 'HW')
    expect(s.current_balance).toBe(100)
  })

  it('heartbeat returns available shop coins', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { available_coins: 5000 } }))
    const r = await sendHeartbeat('B1-TM-001', 'HW', 'ONLINE')
    expect(r.available_coins).toBe(5000)
    expect(lastRequest().body).toMatchObject({ status: 'ONLINE' })
  })

  it('maps a plain 500 to a TerminalApiError with the status code', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500))
    await expect(fetchSession('B1-TM-001', 'HW')).rejects.toMatchObject({ status: 500, message: 'Request failed (500)' })
  })

  it('propagates a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fetchSession('B1-TM-001', 'HW')).rejects.toThrow('Failed to fetch')
  })
})

describe('cash in / tickets', () => {
  it('billIn tolerates balance under a different key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { balance: '250.00', amount: '100', available_coins: 900 } }))
    const r = await billIn('B1-TM-001', 'HW', 100)
    expect(r).toMatchObject({ amount: 100, current_balance: 250, available_coins: 900, machine_id: 'B1-TM-001' })
  })

  it('billIn rejects when the shop float is too low', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, message: 'Shop balance too low' }, 409))
    await expect(billIn('B1-TM-001', 'HW', 200)).rejects.toThrow('Shop balance too low')
  })

  it('ticketIn reads amount and balance from nested ticket objects', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { ticket: { barcode: 'T1A2B3C4D', amount: 170, current_balance: 170 }, message: 'Ticket redeemed' } }),
    )
    const r = await ticketIn('B1-TM-001', 'HW', 't1a2b3c4d')
    expect(r).toMatchObject({ barcode: 'T1A2B3C4D', amount: 170, current_balance: 170 })
    expect(lastRequest().body).toMatchObject({ barcode: 't1a2b3c4d' })
  })

  it('ticketIn: already used ticket', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, message: 'Ticket already redeemed' }, 409))
    await expect(ticketIn('B1-TM-001', 'HW', 'T1')).rejects.toThrow('Ticket already redeemed')
  })

  it('cashOutTicket returns the barcode; cancel restores the balance', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { ticket_id: 1, barcode: 'T9', amount: 170, print_lines: [], current_balance: 0 } }),
    )
    const t = await cashOutTicket('B1-TM-001', 'HW')
    expect(t.barcode).toBe('T9')

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { barcode: 'T9', amount: 170, balance: 170 } }))
    const c = await cancelCashOutTicket('B1-TM-001', 'HW', 'T9')
    expect(c.current_balance).toBe(170)
    expect(c.message).toBe('Ticket restored')
    expect(lastRequest().url).toMatch(/cashout-ticket\/cancel$/)
  })

  it('cashOutTicket parses nested ticket object and string amount', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          ticket: {
            ticket_id: 42,
            barcode: 'TNESTED123',
            amount: '250.50',
            current_balance: 0,
          },
        },
      }),
    )
    const t = await cashOutTicket('B1-TM-001', 'HW')
    expect(t.barcode).toBe('TNESTED123')
    expect(t.amount).toBe(250.5)
    expect(t.ticket_id).toBe(42)
  })

  it('cashOutTicket with nothing to pay out', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, message: 'No balance to cash out' }, 422))
    await expect(cashOutTicket('B1-TM-001', 'HW')).rejects.toThrow('No balance to cash out')
  })
})

describe('games', () => {
  it('launchProviderGame sends the server return page, not the terminal address', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: 'https://games.example/launch/1' }))
    await launchProviderGame('B1', 'HW', 'aviator')
    const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
    const { return_url } = JSON.parse(String(init.body)) as { return_url: string }
    expect(return_url).toMatch(/\/terminal-return$/)
    expect(return_url.startsWith(window.location.origin)).toBe(false)
  })

  it('launchProviderGame accepts several server shapes but insists on an http URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: 'https://games.example/launch/1' }))
    expect((await launchProviderGame('B1', 'HW', 'aviator')).game_url).toBe('https://games.example/launch/1')

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { url: 'https://games.example/2', name: 'Aviator', provider: 'spribe' } }))
    const r = await launchProviderGame('B1', 'HW', 'aviator')
    expect(r).toMatchObject({ game_url: 'https://games.example/2', game_name: 'Aviator', provider: 'spribe', game_id: 'aviator' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { url: 'javascript:alert(1)' } }))
    await expect(launchProviderGame('B1', 'HW', 'aviator')).rejects.toBeInstanceOf(TerminalApiError)
  })

  it('fetchProviders falls back to grouping games when the endpoint is missing', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [
          { id: 'a', name: 'Aviator', provider: 'spribe', kind: 'provider' },
          { id: 'b', name: 'Mines', provider: 'spribe', kind: 'provider' },
          { id: 'c', name: 'Wheel', kind: 'local' },
        ],
      }),
    )
    const p = await fetchProviders()
    expect(p).toEqual([expect.objectContaining({ provider: 'spribe', game_count: 2 })])
  })
})

describe('isHardwareUnauthorized', () => {
  it('detects hardware binding failures only', () => {
    expect(isHardwareUnauthorized(new TerminalApiError('x', 403, 'HARDWARE_MISMATCH'))).toBe(true)
    expect(isHardwareUnauthorized(new TerminalApiError('HARDWARE_UNBOUND', 422))).toBe(true)
    expect(isHardwareUnauthorized(new TerminalApiError('Terminal not hardware-bound', 403))).toBe(true)
    expect(isHardwareUnauthorized(new TerminalApiError('Shop closed', 403))).toBe(false)
    expect(isHardwareUnauthorized(new TerminalApiError('hardware', 500))).toBe(false)
    expect(isHardwareUnauthorized(new Error('HARDWARE_MISMATCH'))).toBe(false)
  })
})

describe('formatCurrency', () => {
  it('formats Namibian dollars with two decimals', () => {
    expect(formatCurrency(0)).toBe('N$ 0.00')
    expect(formatCurrency(1234.5)).toMatch(/^N\$ 1,?234\.50$/)
  })
})
