import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/tapGuard', () => ({ blockTapsBriefly: vi.fn() }))

import { useMachine } from '../services/sessionStore'
import KioskAlert, { TicketChecking } from './KioskAlert'
import { ZeroBalanceModal } from './ZeroBalanceModal'
import { CashOutConfirmModal } from './CashOutConfirmModal'

const initial = useMachine.getState()
beforeEach(() => useMachine.setState(initial, true))

describe('KioskAlert (message pop-up)', () => {
  afterEach(() => vi.useRealTimers())

  it('renders nothing when there is no message', () => {
    const { container } = render(<KioskAlert />)
    expect(container.firstChild).toBeNull()
  })

  it('shows title + message and closes on OK', () => {
    render(<KioskAlert />)
    act(() => useMachine.getState().showAlert({ tone: 'error', title: 'Printer problem', message: 'The ticket printer is not connected.' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveClass('tone-error')
    expect(screen.getByText('Printer problem')).toBeInTheDocument()
    expect(screen.getByText('The ticket printer is not connected.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(useMachine.getState().alert).toBeNull()
  })

  it.each([
    ['Scan again please', 'SCAN AGAIN'],
    ['Cash not accepted', 'TRY AGAIN'],
    ['Note reader problem', 'TRY AGAIN'],
  ])('button text for "%s" is %s', (title, label) => {
    render(<KioskAlert />)
    act(() => useMachine.getState().showAlert({ tone: 'error', title, message: 'm' }))
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  })

  it('success messages close by themselves after 3.5 s', () => {
    vi.useFakeTimers()
    render(<KioskAlert />)
    act(() => useMachine.getState().showAlert({ tone: 'ok', title: 'Cash added', message: 'N$ 100.00 added.' }))
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeInTheDocument()
    expect(document.querySelector('.kx-msg-timer')).not.toBeNull()
    act(() => vi.advanceTimersByTime(3400))
    expect(screen.queryByRole('alertdialog')).not.toBeNull()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('error messages stay until the customer taps', () => {
    vi.useFakeTimers()
    render(<KioskAlert />)
    act(() => useMachine.getState().showAlert({ tone: 'error', title: 'Ticket not accepted', message: 'm' }))
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(document.querySelector('.kx-msg-timer')).toBeNull()
  })

  it('tapping the dark backdrop closes, tapping the card does not', () => {
    render(<KioskAlert />)
    act(() => useMachine.getState().showAlert({ tone: 'warn', title: 'Please note', message: 'm' }))
    fireEvent.click(screen.getByRole('alertdialog'))
    expect(screen.queryByRole('alertdialog')).not.toBeNull()
    fireEvent.click(document.querySelector('.kx-msg-backdrop')!)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('TicketChecking cannot be dismissed and announces politely', () => {
    const { rerender } = render(<TicketChecking open />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Checking ticket…')
    fireEvent.click(document.querySelector('.kx-msg-backdrop')!)
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerender(<TicketChecking open={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('ZeroBalanceModal (Insert Money)', () => {
  it('is hidden by default and when the customer has balance', () => {
    const { container } = render(<ZeroBalanceModal />)
    expect(container.firstChild).toBeNull()
    act(() => {
      useMachine.getState().setBalance(50)
      useMachine.getState().setShowInsertMoneyModal(true)
    })
    expect(container.firstChild).toBeNull()
    expect(useMachine.getState().showInsertMoneyModal).toBe(false)
  })

  it('shows accepted notes and both ways to load money', () => {
    render(<ZeroBalanceModal />)
    act(() => useMachine.getState().setShowInsertMoneyModal(true))
    expect(screen.getByRole('alertdialog', { name: 'Insert Money to Play' })).toBeInTheDocument()
    for (const n of ['10', '20', '50', '100', '200']) expect(screen.getByText(n)).toBeInTheDocument()
    expect(screen.getByText('Insert cash')).toBeInTheDocument()
    expect(screen.getByText('Scan ticket')).toBeInTheDocument()
    expect(screen.getByText(/N\$ notes/)).toBeInTheDocument()
  })

  it('closes with X, with Browse Games, and automatically once cash arrives', () => {
    render(<ZeroBalanceModal />)
    act(() => useMachine.getState().setShowInsertMoneyModal(true))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    act(() => useMachine.getState().setShowInsertMoneyModal(true))
    fireEvent.click(screen.getByRole('button', { name: /Browse Games/ }))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    act(() => useMachine.getState().setShowInsertMoneyModal(true))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    act(() => useMachine.getState().setBalance(100))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(useMachine.getState().showInsertMoneyModal).toBe(false)
  })
})

describe('CashOutConfirmModal', () => {
  it('shows the amount to be paid and wires both buttons', () => {
    act(() => useMachine.getState().setBalance(170))
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<CashOutConfirmModal isOpen onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByText('N$ 170.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /CONFIRM & PRINT TICKET/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /CANCEL/ }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.click(document.querySelector('.winbet-modal-backdrop')!)
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('locks both buttons while printing so the customer cannot double-tap', () => {
    render(<CashOutConfirmModal isOpen loading onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Processing & Printing/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /CANCEL/ })).toBeDisabled()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<CashOutConfirmModal isOpen={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
