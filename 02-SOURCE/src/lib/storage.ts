import { invoke } from '@tauri-apps/api/core'

const STORAGE_KEY = 'kiosk-terminal'

export type StoredTerminal = {
  machineId: string
  siteName: string
  pcName: string
  hostname: string
  portalSlug?: string
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function readRaw(): StoredTerminal | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredTerminal
    if (!parsed.machineId) return null
    return parsed
  } catch {
    return null
  }
}

export function loadTerminal(): StoredTerminal | null {
  return readRaw()
}

export function saveTerminal(data: StoredTerminal): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function clearTerminal(): void {
  localStorage.removeItem(STORAGE_KEY)
}

const FINGERPRINT_KEY = 'kiosk-device-fingerprint'
const DEV_OVERRIDE_KEY = 'kiosk-dev-fingerprint-override'

export function unbindDevHardware(): string {
  const newId = `DEV-HW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  localStorage.setItem(DEV_OVERRIDE_KEY, newId)
  localStorage.removeItem(STORAGE_KEY)
  return newId
}

export function resetToRealHardware(): void {
  localStorage.removeItem(DEV_OVERRIDE_KEY)
  localStorage.removeItem(STORAGE_KEY)
}

if (typeof window !== 'undefined') {
  ;(window as any).unbindDevHardware = () => {
    const id = unbindDevHardware()
    console.log(`[Dev] Unbound! Generated fresh Hardware ID: ${id}`)
    window.location.reload()
    return id
  }
  ;(window as any).resetToRealHardware = () => {
    resetToRealHardware()
    console.log('[Dev] Restored real system Hardware ID')
    window.location.reload()
  }
}

/**
 * Live hardware ID — read from Rust on every call (Option 1 anti-clone).
 * If a DEV override is present (for testing/unbinding in Dev), use that.
 */
let cachedFingerprint: Promise<string> | null = null

export async function getLiveHardwareId(): Promise<string> {
  const override = localStorage.getItem(DEV_OVERRIDE_KEY)
  if (override) return override

  if (isTauriRuntime()) {
    cachedFingerprint ??= invoke<string>('get_device_fingerprint').catch((err) => {
      cachedFingerprint = null
      throw err
    })
    return cachedFingerprint
  }

  const existing = localStorage.getItem(FINGERPRINT_KEY)
  if (existing) return existing

  const generated = `WEB-${crypto.randomUUID()}`
  localStorage.setItem(FINGERPRINT_KEY, generated)
  return generated
}

export async function getOperatingSystem(): Promise<string> {
  if (isTauriRuntime()) {
    return invoke<string>('get_operating_system')
  }

  const ua = navigator.userAgent
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('Mac')) return 'macOS'
  return 'Unknown'
}

export function isTauriApp(): boolean {
  return isTauriRuntime()
}
