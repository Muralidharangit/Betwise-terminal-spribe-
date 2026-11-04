/** API config for the Terminal cabinet — set in `test-machines/terminal/.env` before build. */

/** iccpanel API root including `/api` (no portal slug). Example: http://127.0.0.1:8000/api */
export const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api').replace(/\/$/, '')

/** Default portal slug when registration has not set one yet. */
export const DEFAULT_PORTAL_SLUG = (import.meta.env.VITE_PORTAL_SLUG as string | undefined)?.trim() || ''

const PORTAL_SLUG_KEY = 'kiosk-portal-slug'

export function getPortalSlug(): string {
  if (typeof window === 'undefined') return DEFAULT_PORTAL_SLUG
  return (
    localStorage.getItem(PORTAL_SLUG_KEY) ||
    sessionStorage.getItem(PORTAL_SLUG_KEY) ||
    DEFAULT_PORTAL_SLUG
  )
}

export function setPortalSlug(slug: string): void {
  const value = slug.trim()
  if (!value) return
  localStorage.setItem(PORTAL_SLUG_KEY, value)
  sessionStorage.setItem(PORTAL_SLUG_KEY, value)
}

export function clearPortalSlug(): void {
  localStorage.removeItem(PORTAL_SLUG_KEY)
  sessionStorage.removeItem(PORTAL_SLUG_KEY)
}

/** Full shop API base: /api/v1/{portal_slug}/shop */
export function getShopApiBaseUrl(portalSlug = getPortalSlug()): string {
  const slug = portalSlug.trim()
  if (!slug) {
    return `${API_ORIGIN}/v1/_unset_/shop`
  }
  return `${API_ORIGIN}/v1/${encodeURIComponent(slug)}/shop`
}

export const API_BASE_URL = getShopApiBaseUrl()

/**
 * Demo hardware overlay (Ctrl+Shift+H). Set `VITE_HW_SIMULATOR=true` in `.env`.
 * Must be off for production cabinet builds.
 */
export const PUSHER_APP_KEY = (import.meta.env.VITE_PUSHER_APP_KEY as string | undefined)?.trim() ?? ''
export const PUSHER_APP_CLUSTER = (import.meta.env.VITE_PUSHER_APP_CLUSTER as string | undefined)?.trim() || 'ap2'

export function isTerminalRealtimeEnabled(): boolean {
  return PUSHER_APP_KEY.length > 0
}

export function isHardwareSimulatorEnabled(): boolean {
  // Browser demos only. It skips the printer checks, so a leftover flag in `.env` must
  // never reach the terminal app, where it would pay out without a printed ticket.
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) return false
  const raw = (import.meta.env.VITE_HW_SIMULATOR as string | undefined)?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
}
