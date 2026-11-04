export type PerfMode = 'lite' | 'full'

/**
 * Lite mode stops endless decorative animations and frosted-glass blur so the kiosk
 * stays smooth on low-end PCs. VITE_PERF_MODE = lite | full | auto (default auto).
 */
function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function resolvePerfMode(): PerfMode {
  const setting = String(import.meta.env.VITE_PERF_MODE ?? 'auto').toLowerCase()
  if (setting === 'lite' || setting === 'full') return setting
  // Shop terminals run inside WebKitGTK / WebView2. Decorative blur and looping
  // animations are expensive there, so the terminal app always starts in lite.
  if (isTauriRuntime()) return 'lite'
  const cores = navigator.hardwareConcurrency || 2
  const memoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (cores <= 4) return 'lite'
  if (memoryGb !== undefined && memoryGb <= 4) return 'lite'
  return 'full'
}

export function applyPerfMode(): PerfMode {
  const mode = resolvePerfMode()
  document.documentElement.classList.toggle('perf-lite', mode === 'lite')
  return mode
}
