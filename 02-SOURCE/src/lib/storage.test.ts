import { describe, expect, it } from 'vitest'
import {
  clearTerminal,
  getLiveHardwareId,
  getOperatingSystem,
  isTauriApp,
  loadTerminal,
  resetToRealHardware,
  saveTerminal,
  unbindDevHardware,
} from './storage'

const sample = { machineId: 'B1-TM-001', siteName: 'Shop B1', pcName: 'CABIN-01', hostname: 'cabin-01', portalSlug: 'betwise' }

describe('terminal storage', () => {
  it('round-trips the registered terminal', () => {
    expect(loadTerminal()).toBeNull()
    saveTerminal(sample)
    expect(loadTerminal()).toEqual(sample)
    clearTerminal()
    expect(loadTerminal()).toBeNull()
  })

  it('ignores corrupt or incomplete data instead of crashing', () => {
    localStorage.setItem('kiosk-terminal', '{not json')
    expect(loadTerminal()).toBeNull()
    localStorage.setItem('kiosk-terminal', JSON.stringify({ siteName: 'no machine id' }))
    expect(loadTerminal()).toBeNull()
  })

  it('is not the Tauri app inside the test browser', () => {
    expect(isTauriApp()).toBe(false)
  })
})

describe('hardware id (outside Tauri)', () => {
  it('creates one WEB- id and keeps it stable', async () => {
    const a = await getLiveHardwareId()
    const b = await getLiveHardwareId()
    expect(a).toMatch(/^WEB-[0-9a-f-]{36}$/)
    expect(b).toBe(a)
  })

  it('dev override wins and also forgets the registered terminal', async () => {
    saveTerminal(sample)
    const id = unbindDevHardware()
    expect(id).toMatch(/^DEV-HW-[0-9A-F]{8}$/)
    expect(await getLiveHardwareId()).toBe(id)
    expect(loadTerminal()).toBeNull()
    resetToRealHardware()
    expect(await getLiveHardwareId()).not.toBe(id)
  })

  it('reports an operating system name from the user agent', async () => {
    const os = await getOperatingSystem()
    expect(['Windows', 'Linux', 'macOS', 'Unknown']).toContain(os)
  })
})
