import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyPerfMode, resolvePerfMode } from './perfMode'

const originalCores = navigator.hardwareConcurrency
const originalMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory

afterEach(() => {
  vi.unstubAllEnvs()
  document.documentElement.classList.remove('perf-lite')
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: originalCores })
  Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: originalMemory })
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
})

describe('resolvePerfMode', () => {
  it('honours an explicit lite / full setting', () => {
    vi.stubEnv('VITE_PERF_MODE', 'lite')
    expect(resolvePerfMode()).toBe('lite')
    vi.stubEnv('VITE_PERF_MODE', 'full')
    expect(resolvePerfMode()).toBe('full')
  })

  it('uses lite inside the Tauri terminal even on a powerful PC', () => {
    vi.stubEnv('VITE_PERF_MODE', 'auto')
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 16 })
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 16 })
    ;(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    expect(resolvePerfMode()).toBe('lite')
  })

  it('uses lite on a 4-core or 4 GB browser machine', () => {
    vi.stubEnv('VITE_PERF_MODE', 'auto')
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 4 })
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 })
    expect(resolvePerfMode()).toBe('lite')

    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 })
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 4 })
    expect(resolvePerfMode()).toBe('lite')
  })

  it('uses full on a strong browser machine that is not Tauri', () => {
    vi.stubEnv('VITE_PERF_MODE', 'auto')
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 })
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 })
    expect(resolvePerfMode()).toBe('full')
  })
})

describe('applyPerfMode', () => {
  it('toggles html.perf-lite', () => {
    vi.stubEnv('VITE_PERF_MODE', 'lite')
    expect(applyPerfMode()).toBe('lite')
    expect(document.documentElement.classList.contains('perf-lite')).toBe(true)

    vi.stubEnv('VITE_PERF_MODE', 'full')
    expect(applyPerfMode()).toBe('full')
    expect(document.documentElement.classList.contains('perf-lite')).toBe(false)
  })
})
