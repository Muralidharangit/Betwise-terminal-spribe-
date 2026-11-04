import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiagnoseReport } from '../lib/hardware'
import { PLAIN } from '../utils/friendlyMessage'

const diagnoseHardware = vi.fn()
const fetchHwConfig = vi.fn()
const printTestTicket = vi.fn()
const onNoteAccepted = vi.fn()
const createBarcodeListener = vi.fn()

vi.mock('../lib/hardware', () => ({
  diagnoseHardware: (...args: unknown[]) => diagnoseHardware(...args),
  fetchHwConfig: (...args: unknown[]) => fetchHwConfig(...args),
  printTestTicket: (...args: unknown[]) => printTestTicket(...args),
  onNoteAccepted: (...args: unknown[]) => onNoteAccepted(...args),
}))

vi.mock('../lib/storage', () => ({
  isTauriApp: () => true,
  loadTerminal: () => ({
    machineId: 'B1-TM-001',
    siteName: 'Shop B1',
    pcName: 'CABIN-01',
    hostname: 'cabin-01',
    portalSlug: 'betwise',
  }),
}))

vi.mock('../hardware/barcodeBridge', () => ({
  createBarcodeListener: (...args: unknown[]) => createBarcodeListener(...args),
}))

import { HardwareTestGate } from './HardwareTestGate'
import { useMachine } from '../services/sessionStore'

const readyReport: DiagnoseReport = {
  os: 'Windows 11',
  user: 'kiosk',
  groups: [],
  printer_model: 'XP-Q851L',
  checks: [
    { id: 'printer_driver', name: 'Printer driver', ok: true, detail: 'ok' },
    { id: 'printer_device', name: 'Printer connected', ok: true, detail: 'USB001' },
    { id: 'printer_write', name: 'Printer permission', ok: true, detail: 'ok' },
    { id: 'printer_live', name: 'Printer ready', ok: true, detail: 'ok' },
    { id: 'bill_model', name: 'Bill acceptor model', ok: true, detail: 'NV10 (ITL)' },
    { id: 'bill_device', name: 'Bill acceptor port', ok: true, detail: 'COM3' },
    { id: 'bill_open', name: 'Bill acceptor serial', ok: true, detail: 'ok' },
    { id: 'usb_scanner', name: 'HID barcode scanner', ok: false, detail: '' },
    { id: 'groups', name: 'User groups', ok: true, detail: 'ok' },
  ],
}

const printerFailReport: DiagnoseReport = {
  ...readyReport,
  checks: readyReport.checks.map((c) =>
    c.id === 'printer_device' ? { ...c, ok: false, detail: 'not found' } : c,
  ),
}

const initial = useMachine.getState()

function openGate() {
  fireEvent.keyDown(window, { key: 'D', code: 'KeyD', ctrlKey: true, shiftKey: true, bubbles: true })
}

function unlock(password = 'admin123') {
  openGate()
  fireEvent.change(screen.getByPlaceholderText('Staff password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: /Unlock/ }))
}

async function finishCheck() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    vi.advanceTimersByTime(1300)
  })
}

beforeEach(() => {
  useMachine.setState(initial, true)
  vi.useFakeTimers()
  diagnoseHardware.mockReset().mockResolvedValue(readyReport)
  fetchHwConfig.mockReset().mockResolvedValue({ AdminPassword: 'admin123' })
  printTestTicket.mockReset().mockResolvedValue(undefined)
  onNoteAccepted.mockReset().mockResolvedValue(() => undefined)
  createBarcodeListener.mockReset().mockReturnValue(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('HardwareTestGate — password', () => {
  it('is hidden until Ctrl+Shift+D', () => {
    const { container } = render(<HardwareTestGate />)
    expect(container.firstChild).toBeNull()
    openGate()
    expect(screen.getByRole('dialog', { name: 'Terminal Check' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Staff password')).toBeInTheDocument()
  })

  it('rejects the wrong password and stays on the gate', () => {
    render(<HardwareTestGate />)
    unlock('nope')
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong password. Please try again.')
    expect(screen.getByPlaceholderText('Staff password')).toBeInTheDocument()
    expect(diagnoseHardware).not.toHaveBeenCalled()
  })

  it('Cancel closes the password gate', () => {
    render(<HardwareTestGate />)
    openGate()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('HardwareTestGate — Check again', () => {
  it('shows a visible checking state, then the fresh result with a timestamp', async () => {
    render(<HardwareTestGate />)
    unlock()

    expect(screen.getByText('Checking devices…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Checking/ })).toBeDisabled()
    expect(document.querySelector('.hwx-diag')).toHaveClass('is-busy')

    await finishCheck()

    expect(screen.getByText('All devices are ready')).toBeInTheDocument()
    expect(screen.getByText(/Checked at/)).toBeInTheDocument()
    expect(screen.getByText('XP-Q851L')).toBeInTheDocument()
    expect(screen.getByText('Connected and ready to print tickets.')).toBeInTheDocument()
    expect(screen.getByText('Connected and ready to accept notes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Check again/ })).toBeEnabled()
    expect(useMachine.getState().installTestActive).toBe(true)
  })

  it('Check again fades the cards and increments the check count', async () => {
    render(<HardwareTestGate />)
    unlock()
    await finishCheck()

    diagnoseHardware.mockResolvedValueOnce(printerFailReport)
    fireEvent.click(screen.getByRole('button', { name: /Check again/ }))

    expect(screen.getByText('Checking devices again…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Checking/ })).toBeDisabled()
    expect(document.querySelector('.hwx-diag')).toHaveClass('is-busy')

    await finishCheck()

    expect(screen.getByText(/device needs attention/i)).toBeInTheDocument()
    expect(screen.getByText(/check 2/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Printer not found. Check that it is switched on and the USB cable is plugged in/),
    ).toBeInTheDocument()
    expect(diagnoseHardware).toHaveBeenCalledTimes(2)
  })

  it('Check again clears a previous print-test result', async () => {
    render(<HardwareTestGate />)
    unlock()
    await finishCheck()

    printTestTicket.mockRejectedValueOnce(
      new Error("Printer not connected (\\\\.\\USB001). Check the USB cable and power."),
    )
    fireEvent.click(screen.getByRole('button', { name: /Print test ticket/ }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText(PLAIN.printerNotConnected)).toBeInTheDocument()
    expect(screen.queryByText(/USB001/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Check again/ }))
    expect(screen.queryByText(PLAIN.printerNotConnected)).toBeNull()
    await finishCheck()
  })

  it('maps a diagnose failure to a plain sentence', async () => {
    diagnoseHardware.mockRejectedValueOnce(new Error('Error invoking remote method \'hardware_diagnose\': os error 5'))
    render(<HardwareTestGate />)
    unlock()
    await finishCheck()
    expect(screen.getByText('Could not run the check')).toBeInTheDocument()
    expect(
      screen.getByText('The machine check could not run. Close this window and try again, or call support.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/os error/)).toBeNull()
  })

  it('Done closes the page and unpauses cash-in', async () => {
    render(<HardwareTestGate />)
    unlock()
    await finishCheck()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useMachine.getState().installTestActive).toBe(false)
  })
})
