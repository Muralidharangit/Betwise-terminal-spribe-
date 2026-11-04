import { getPortalSlug, getShopApiBaseUrl, setPortalSlug, API_ORIGIN } from '../config/env'
import { loadTerminal } from '../lib/storage'

function resolvePortalSlug(explicit?: string): string {
  const fromArg = explicit?.trim()
  if (fromArg) return fromArg
  const fromStore = getPortalSlug().trim()
  if (fromStore) return fromStore
  const stored = loadTerminal()?.portalSlug?.trim()
  if (stored) {
    setPortalSlug(stored)
    return stored
  }
  return ''
}

function apiBase(portalSlug?: string): string {
  return getShopApiBaseUrl(resolvePortalSlug(portalSlug))
}

export type TerminalRegistration = {
  success: boolean
  message: string
  machine_id: string
  hostname: string
  pc_name: string
  site_id: number
  site_name: string
  status: string
  portal_slug?: string
  registration_token?: string
}

export type TerminalSession = {
  id?: number
  player_id?: number | null
  machine_id: string
  hostname: string
  pc_name: string
  site_id: number
  site_name: string
  status: string
  current_balance: number
  loaded_amount: number
  available_coins?: number
  portal_slug?: string
}

type Pagination = {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

type ApiSuccess<T> = { success: true; data: T; message?: string; pagination?: Pagination }
type ApiError = {
  success: false
  message: string
  errors?: { code?: string; device_fingerprint?: string | string[] }
}

function firstErrorValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0]) return value[0]
  return undefined
}

export class TerminalApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'TerminalApiError'
    this.status = status
    this.code = code
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = await response.json()
  if (!response.ok) {
    let message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Request failed (${response.status})`

    if (
      typeof body === 'object' &&
      body !== null &&
      'errors' in body &&
      typeof (body as ApiError).errors === 'object' &&
      (body as ApiError).errors !== null
    ) {
      const firstFieldError = Object.values((body as ApiError).errors as Record<string, string[]>)
        .flat()
        .find(Boolean)
      if (firstFieldError) {
        message = firstFieldError
      }
    }

    const errors =
      typeof body === 'object' &&
      body !== null &&
      'errors' in body &&
      typeof (body as ApiError).errors === 'object' &&
      (body as ApiError).errors !== null
        ? (body as ApiError).errors
        : undefined
    const code =
      errors?.code ||
      firstErrorValue(errors?.device_fingerprint) ||
      undefined
    throw new TerminalApiError(message, response.status, code)
  }
  return body as T
}

type RegisterApiData = {
  machine_id: string
  hostname?: string
  terminal_name?: string
  pc_name?: string
  site_id?: number
  shop_id?: number
  site_name?: string
  shop_name?: string
  status: string
}

export async function registerTerminal(input: {
  registration_token: string
  device_fingerprint: string
  operating_system: string
  portal_slug: string
}): Promise<TerminalRegistration> {
  const portalSlug = input.portal_slug.trim()
  setPortalSlug(portalSlug)

  const response = await fetch(`${getShopApiBaseUrl(portalSlug)}/terminals/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      registration_token: input.registration_token,
      device_fingerprint: input.device_fingerprint,
      operating_system: input.operating_system,
    }),
  })

  const body = await parseJson<ApiSuccess<RegisterApiData> & { message?: string }>(response)
  if (!body.success || !body.data) {
    throw new TerminalApiError(body.message || 'Registration failed', response.status)
  }

  const data = body.data
  const hostname = data.hostname || data.terminal_name || data.pc_name || data.machine_id
  const pcName = data.pc_name || data.terminal_name || data.hostname || data.machine_id
  const siteName = data.site_name || data.shop_name || ''

  return {
    success: true,
    message: body.message || 'Registration successful',
    machine_id: data.machine_id,
    hostname,
    pc_name: pcName,
    site_id: data.site_id ?? data.shop_id ?? 0,
    site_name: siteName,
    status: data.status,
    portal_slug: portalSlug,
    registration_token: input.registration_token.trim().toUpperCase(),
  }
}

export async function fetchSession(
  machineId: string,
  hardwareId: string,
): Promise<TerminalSession> {
  const params = new URLSearchParams({
    machine_id: machineId,
    device_fingerprint: hardwareId,
  })
  const response = await fetch(`${apiBase()}/terminals/session?${params}`, {
    headers: { Accept: 'application/json' },
  })

  const body = await parseJson<
    ApiSuccess<TerminalSession & { shop_name?: string; terminal_name?: string }> | ApiError
  >(response)
  if (!body.success) {
    throw new TerminalApiError(body.message, response.status)
  }

  const data = body.data
  if (data.portal_slug) {
    setPortalSlug(data.portal_slug)
  }

  return {
    ...data,
    // Laravel can send decimals as strings ("100.00"); same parsing as bill-in and ticket-in.
    current_balance: Number(data.current_balance),
    hostname: data.hostname || data.terminal_name || data.pc_name,
    pc_name: data.pc_name || data.hostname || data.terminal_name || data.machine_id,
    site_name: data.site_name || data.shop_name || '',
  }
}

export async function sendHeartbeat(
  machineId: string,
  hardwareId: string,
  status: 'ONLINE' | 'OFFLINE',
): Promise<{ available_coins?: number }> {
  const response = await fetch(`${apiBase()}/terminals/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      machine_id: machineId,
      device_fingerprint: hardwareId,
      status,
    }),
  })

  const body = await parseJson<ApiSuccess<{ portal_slug?: string; available_coins?: number }>>(response)
  if (body.data?.portal_slug) {
    setPortalSlug(body.data.portal_slug)
  }
  return body.data ?? {}
}

export type BetResult = {
  game: string
  game_name: string
  choice: string
  result: string
  won: boolean
  stake: number
  payout: number
  multiplier: number
  current_balance: number
  message: string
  /** Game round number shown on terminal and Account Statement Desc (not DB id). */
  round_id: string
  transaction_id?: number
}

export type GameCatalogItem = {
  id: string
  name: string
  category?: string
  description?: string
  payout_label?: string
  choices?: string[]
  kind?: 'local' | 'provider'
  provider?: string
  image?: string | null
  image_url?: string | null
  game_image?: string | null
  images?: {
    image?: string | null
    logo?: string | null
    banner?: string | null
    thumbnail?: string | null
  } | null
  provider_image?: string | null
  uuid?: string
  launcher?: string
  [key: string]: unknown
}

export type GamesPage = {
  items: GameCatalogItem[]
  pagination: Pagination
}

export async function fetchGames(input: {
  provider?: string
  page?: number
  limit?: number
} = {}): Promise<GamesPage> {
  const page = input.page ?? 1
  const limit = input.limit ?? 50
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (input.provider) {
    params.set('provider', input.provider)
  }
  const response = await fetch(`${apiBase()}/terminals/games?${params}`, {
    headers: { Accept: 'application/json' },
  })
  const body = await parseJson<ApiSuccess<GameCatalogItem[]> | ApiError>(response)
  if (!body.success) {
    throw new TerminalApiError(body.message, response.status)
  }
  const items = body.data ?? []
  return {
    items,
    pagination: body.pagination ?? {
      current_page: page,
      last_page: items.length >= limit ? page + 1 : page,
      per_page: limit,
      total: items.length,
    },
  }
}

export type ShopProviderItem = {
  id: number
  provider: string
  game_count: number
  images?: {
    logo?: string | null
    name?: string | null
    logo_name?: string | null
  }
}

export async function fetchProviders(page = 1, limit = 100): Promise<ShopProviderItem[]> {
  const response = await fetch(`${apiBase()}/terminals/providers?page=${page}&limit=${limit}`, {
    headers: { Accept: 'application/json' },
  })
  if (response.status === 404) {
    return deriveProvidersFromGames()
  }
  const body = await parseJson<ApiSuccess<ShopProviderItem[]> | ApiError>(response)
  if (!body.success) {
    throw new TerminalApiError(body.message, response.status)
  }
  return body.data
}

async function deriveProvidersFromGames(): Promise<ShopProviderItem[]> {
  const result = await fetchGames({ page: 1, limit: 100 })
  const grouped = new Map<string, ShopProviderItem>()
  for (const game of result.items) {
    if (game.kind === 'local') continue
    const name = game.provider?.trim()
    if (!name) continue
    const current = grouped.get(name)
    if (current) {
      current.game_count += 1
      continue
    }
    grouped.set(name, {
      id: grouped.size + 1,
      provider: name,
      game_count: 1,
      images: {
        logo: game.provider_image ?? null,
        name: null,
        logo_name: null,
      },
    })
  }
  return [...grouped.values()]
}

export type ProviderLaunchResult = {
  game_url: string
  game_name: string
  provider: string
  game_id: string
  player_id: number
}

export async function launchProviderGame(
  machineId: string,
  hardwareId: string,
  game: string,
): Promise<ProviderLaunchResult> {
  // The server's return page, per the API doc. Never this app's own address: that is
  // localhost / tauri://, which a provider cannot use and would load inside the game iframe.
  const returnUrl = `${API_ORIGIN.replace(/\/api$/, '')}/terminal-return`
  const response = await fetch(`${apiBase()}/terminals/launch-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      machine_id: machineId,
      device_fingerprint: hardwareId,
      game,
      return_url: returnUrl,
    }),
  })

  const body = await parseJson<ApiSuccess<ProviderLaunchResult | string> | ApiError>(response)
  if (!body.success) {
    throw new TerminalApiError(body.message || 'Game launch failed', response.status)
  }

  let game_url = ''
  let game_name = ''
  let provider = ''
  let player_id = 0

  if (typeof body.data === 'string') {
    game_url = body.data
  } else if (body.data && typeof body.data === 'object') {
    const d = body.data as Record<string, unknown>
    game_url = String(d.game_url ?? d.url ?? d.launch_url ?? d.link ?? d.gameUrl ?? '')
    game_name = String(d.game_name ?? d.name ?? '')
    provider = String(d.provider ?? '')
    player_id = Number(d.player_id ?? 0)
  }

  if (!game_url) {
    const raw = body as unknown as Record<string, unknown>
    game_url = String(raw.game_url ?? raw.url ?? raw.launch_url ?? raw.link ?? '')
    if (raw.game_name) game_name = String(raw.game_name)
    if (raw.provider) provider = String(raw.provider)
  }

  if (!game_url || !game_url.startsWith('http')) {
    throw new TerminalApiError(body.message || 'Game launch URL was invalid or missing from server response', 500)
  }

  return {
    game_url,
    game_name,
    provider,
    game_id: game,
    player_id,
  }
}

export async function placeBet(
  machineId: string,
  hardwareId: string,
  game: string,
  choice: string,
  stake: number,
): Promise<BetResult> {
  const response = await fetch(`${apiBase()}/terminals/place-bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      machine_id: machineId,
      device_fingerprint: hardwareId,
      game,
      choice,
      stake,
    }),
  })

  const body = await parseJson<ApiSuccess<BetResult> | ApiError>(response)
  if (!body.success) {
    throw new TerminalApiError(body.message, response.status)
  }
  return body.data
}

export type BillInResult = {
  machine_id: string
  amount: number
  current_balance: number
  status: string
  available_coins?: number
}

export type CashOutTicketResult = {
  ticket_id: number
  barcode: string
  amount: number
  issued_at?: string
  print_lines: string[]
  current_balance: number
}

export type TicketInResult = {
  barcode: string
  amount: number
  current_balance: number
  status: string
  message: string
}

/** Bill acceptor cash-in (real note accepted). */
export async function billIn(
  machineId: string,
  hardwareId: string,
  amount: number,
): Promise<BillInResult> {
  const response = await fetch(`${apiBase()}/terminals/bill-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      machine_id: machineId,
      device_fingerprint: hardwareId,
      amount,
    }),
  })

  const body = await parseJson<ApiSuccess<BillInResult> | ApiError>(response)
  if (!body.success) {
    throw new TerminalApiError(body.message, response.status)
  }
  const d = ((body as ApiSuccess<BillInResult>).data || body) as Record<string, unknown>
  const current_balance = Number(d.current_balance ?? d.balance ?? 0)
  const accepted_amount = Number(d.amount ?? amount)
  return {
    machine_id: String(d.machine_id ?? machineId),
    amount: Number.isFinite(accepted_amount) ? accepted_amount : amount,
    current_balance: Number.isFinite(current_balance) ? current_balance : 0,
    status: String(d.status ?? 'OK'),
    available_coins: d.available_coins != null ? Number(d.available_coins) : undefined,
  }
}

/** Cash-out: clear balance and issue a printable barcode ticket. */
export async function cashOutTicket(
  machineId: string,
  hardwareId: string,
): Promise<CashOutTicketResult> {
  const response = await fetch(`${apiBase()}/terminals/cashout-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      machine_id: machineId,
      device_fingerprint: hardwareId,
    }),
  })

  const body = await parseJson<ApiSuccess<CashOutTicketResult> | ApiError>(response)
  if (!body.success) {
    throw new TerminalApiError(body.message, response.status)
  }
  const d = ((body as ApiSuccess<CashOutTicketResult>).data || body) as Record<string, unknown>
  const ticketObj = d.ticket && typeof d.ticket === 'object' ? (d.ticket as Record<string, unknown>) : null
  const voucherObj = d.voucher && typeof d.voucher === 'object' ? (d.voucher as Record<string, unknown>) : null

  const barcode = String(
    d.barcode ??
      ticketObj?.barcode ??
      voucherObj?.barcode ??
      d.code ??
      ticketObj?.code ??
      voucherObj?.code ??
      '',
  )

  const rawAmount =
    d.amount ??
    d.cash_out_amount ??
    d.cashout_amount ??
    d.payout ??
    d.payout_amount ??
    d.credit ??
    d.value ??
    ticketObj?.amount ??
    ticketObj?.cash_out_amount ??
    ticketObj?.cashout_amount ??
    ticketObj?.payout ??
    ticketObj?.value ??
    voucherObj?.amount ??
    voucherObj?.value ??
    0

  const parsedAmount = typeof rawAmount === 'string' ? parseFloat(rawAmount) : Number(rawAmount)
  const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0

  const ticketId = Number(d.ticket_id ?? ticketObj?.ticket_id ?? ticketObj?.id ?? d.id ?? 0)
  const currentBalance = Number(d.current_balance ?? d.balance ?? ticketObj?.current_balance ?? 0)

  return {
    ticket_id: Number.isFinite(ticketId) ? ticketId : 0,
    barcode,
    amount,
    issued_at: (d.issued_at ?? ticketObj?.issued_at ?? voucherObj?.issued_at) as string | undefined,
    print_lines: Array.isArray(d.print_lines)
      ? (d.print_lines as string[])
      : Array.isArray(ticketObj?.print_lines)
        ? (ticketObj.print_lines as string[])
        : [],
    current_balance: Number.isFinite(currentBalance) ? currentBalance : 0,
  }
}

/** Print failed — void ticket and restore credit to the kiosk. */
export async function cancelCashOutTicket(
  machineId: string,
  hardwareId: string,
  barcode: string,
): Promise<{ barcode: string; amount: number; current_balance: number; message: string }> {
  const response = await fetch(`${apiBase()}/terminals/cashout-ticket/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      machine_id: machineId,
      device_fingerprint: hardwareId,
      barcode,
    }),
  })

  const body = await parseJson<
    | ApiSuccess<{ barcode: string; amount: number; current_balance: number; message: string }>
    | ApiError
  >(response)
  if (!body.success) {
    throw new TerminalApiError(body.message, response.status)
  }
  const d = ((body as ApiSuccess<{ barcode: string; amount: number; current_balance: number; message: string }>).data || body) as Record<string, unknown>
  return {
    barcode: String(d.barcode ?? barcode),
    amount: Number(d.amount ?? 0),
    current_balance: Number(d.current_balance ?? d.balance ?? 0),
    message: String(d.message ?? body.message ?? 'Ticket restored'),
  }
}

/** Ticket-in: scan barcode on kiosk scanner → credit this kiosk. */
export async function ticketIn(
  machineId: string,
  hardwareId: string,
  barcode: string,
): Promise<TicketInResult> {
  const response = await fetch(`${apiBase()}/terminals/ticket-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      machine_id: machineId,
      device_fingerprint: hardwareId,
      barcode,
    }),
  })

  const body = await parseJson<ApiSuccess<TicketInResult> | ApiError>(response)
  if (!body.success) {
    throw new TerminalApiError(body.message, response.status)
  }
  const d = ((body as ApiSuccess<TicketInResult>).data || body) as Record<string, unknown>
  const ticketObj = (d.ticket && typeof d.ticket === 'object') ? (d.ticket as Record<string, unknown>) : null
  const current_balance = Number(d.current_balance ?? d.balance ?? d.new_balance ?? ticketObj?.current_balance ?? 0)
  const amount = Number(d.amount ?? d.credit ?? d.ticket_amount ?? d.redeemed_amount ?? d.value ?? ticketObj?.amount ?? ticketObj?.value ?? 0)
  return {
    barcode: String(d.barcode ?? ticketObj?.barcode ?? barcode),
    amount: Number.isFinite(amount) ? amount : 0,
    current_balance: Number.isFinite(current_balance) ? current_balance : 0,
    status: String(d.status ?? 'OK'),
    message: String(d.message ?? body.message ?? 'Ticket redeemed'),
  }
}

export type CreditAdjustResult = {
  current_balance: number
  delta: number
  status: string
}

/** Arena game stake (negative) or win (positive). */
export async function creditAdjust(
  machineId: string,
  hardwareId: string,
  delta: number,
  remarks = '',
): Promise<CreditAdjustResult> {
  const response = await fetch(`${apiBase()}/terminals/credit-adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      machine_id: machineId,
      device_fingerprint: hardwareId,
      delta,
      remarks,
    }),
  })

  const body = await parseJson<ApiSuccess<CreditAdjustResult> | ApiError>(response)
  if (!body.success) {
    throw new TerminalApiError(body.message, response.status)
  }
  return body.data
}

export function formatCurrency(amount: number): string {
  return `N$ ${amount.toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function isHardwareUnauthorized(error: unknown): boolean {
  if (!(error instanceof TerminalApiError)) {
    return false
  }

  const hardwareCodes = ['HARDWARE_MISMATCH', 'HARDWARE_UNBOUND']
  if (hardwareCodes.includes(error.code ?? '') || hardwareCodes.includes(error.message)) {
    return error.status === 403 || error.status === 422
  }

  if (error.status !== 403) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('hardware') ||
    message.includes('not authorized') ||
    message.includes('not hardware-bound')
  )
}
