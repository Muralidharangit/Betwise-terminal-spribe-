import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'

vi.mock('../lib/storage', () => ({
  isTauriApp: () => true,
}))

import { StaffExitGate } from './StaffExitGate'

function openExit() {
  fireEvent.keyDown(window, { key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true, bubbles: true })
}

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  vi.mocked(invoke).mockResolvedValue(undefined)
})

describe('StaffExitGate', () => {
  it('is hidden until Ctrl+Shift+K', () => {
    const { container } = render(<StaffExitGate />)
    expect(container.firstChild).toBeNull()
    openExit()
    expect(screen.getByRole('dialog', { name: 'Staff exit' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Admin password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exit terminal' })).toBeDisabled()
  })

  it('Cancel closes without calling the app', () => {
    render(<StaffExitGate />)
    openExit()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(invoke).toHaveBeenCalledWith('enter_kiosk_mode')
    expect(invoke).not.toHaveBeenCalledWith('exit_kiosk_mode', expect.anything())
  })

  it('wrong password stays open with a plain message', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'exit_kiosk_mode') return Promise.reject(new Error('Incorrect password.'))
      return Promise.resolve(undefined)
    })
    render(<StaffExitGate />)
    openExit()
    fireEvent.change(screen.getByPlaceholderText('Admin password'), { target: { value: 'nope' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exit terminal' }))
    })
    expect(screen.getByText('Wrong password. Please try again.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('hides technical errors from the screen', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'exit_kiosk_mode') return Promise.reject(new Error('os error 5 at src/kiosk_lock.rs:88'))
      return Promise.resolve(undefined)
    })
    render(<StaffExitGate />)
    openExit()
    fireEvent.change(screen.getByPlaceholderText('Admin password'), { target: { value: 'admin123' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exit terminal' }))
    })
    expect(screen.getByText('Could not leave fullscreen. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText(/os error|kiosk_lock/)).toBeNull()
  })

  it('closes after a correct password', async () => {
    render(<StaffExitGate />)
    openExit()
    fireEvent.change(screen.getByPlaceholderText('Admin password'), { target: { value: 'admin123' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exit terminal' }))
    })
    expect(invoke).toHaveBeenCalledWith('exit_kiosk_mode', { password: 'admin123' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
