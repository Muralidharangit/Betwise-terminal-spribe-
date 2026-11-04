import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/tapGuard', () => ({ blockTapsBriefly: vi.fn() }))

import { blockTapsBriefly } from '../lib/tapGuard'
import { useMachine } from './sessionStore'

const initial = useMachine.getState()

beforeEach(() => {
  useMachine.setState(initial, true)
  vi.mocked(blockTapsBriefly).mockClear()
})

describe('balance', () => {
  it('stores numbers and never goes negative', () => {
    useMachine.getState().setBalance(150.5)
    expect(useMachine.getState().balance).toBe(150.5)
    useMachine.getState().setBalance(-20)
    expect(useMachine.getState().balance).toBe(0)
  })

  it('accepts numeric strings from the API and rejects garbage', () => {
    useMachine.getState().setBalance('42.10' as unknown as number)
    expect(useMachine.getState().balance).toBe(42.1)
    useMachine.getState().setBalance('abc' as unknown as number)
    expect(useMachine.getState().balance).toBe(0)
    useMachine.getState().setBalance(NaN)
    expect(useMachine.getState().balance).toBe(0)
  })

  it('last cash amount follows the same rules and allows null', () => {
    useMachine.getState().setLastCash(100)
    expect(useMachine.getState().lastCashAmount).toBe(100)
    useMachine.getState().setLastCash(null)
    expect(useMachine.getState().lastCashAmount).toBeNull()
    useMachine.getState().setLastCash(-5)
    expect(useMachine.getState().lastCashAmount).toBe(0)
  })
})

describe('pop-up rules', () => {
  it('a new message replaces the Insert Money pop-up', () => {
    useMachine.getState().setShowInsertMoneyModal(true)
    useMachine.getState().showAlert({ tone: 'error', title: 'Ticket not accepted', message: 'x' })
    expect(useMachine.getState().showInsertMoneyModal).toBe(false)
    expect(useMachine.getState().alert?.title).toBe('Ticket not accepted')
  })

  it('opening Insert Money clears any message', () => {
    useMachine.getState().showAlert({ tone: 'warn', title: 'Please note', message: 'x' })
    useMachine.getState().setShowInsertMoneyModal(true)
    expect(useMachine.getState().alert).toBeNull()
    expect(useMachine.getState().showInsertMoneyModal).toBe(true)
  })

  it('closing a pop-up swallows the touch-screen ghost tap', () => {
    useMachine.getState().showAlert({ tone: 'error', title: 't', message: 'm' })
    useMachine.getState().clearAlert()
    expect(blockTapsBriefly).toHaveBeenCalledTimes(1)

    useMachine.getState().setShowInsertMoneyModal(true)
    useMachine.getState().setShowInsertMoneyModal(false)
    expect(blockTapsBriefly).toHaveBeenCalledTimes(2)
  })

  it('clearing when nothing is open does not block taps', () => {
    useMachine.getState().clearAlert()
    useMachine.getState().setShowInsertMoneyModal(false)
    expect(blockTapsBriefly).not.toHaveBeenCalled()
  })
})

describe('misc state', () => {
  it('tracks credit source, ticket, printer warning and staff test flag', () => {
    const s = useMachine.getState()
    s.setCreditSource('ticket')
    s.setLastTicket('T1A2B3C4')
    s.setPrinterWarning('warn')
    s.setInstallTestActive(true)
    s.setMachineId('B1-TM-001')
    const n = useMachine.getState()
    expect(n.creditSource).toBe('ticket')
    expect(n.lastTicketCode).toBe('T1A2B3C4')
    expect(n.printerWarning).toBe('warn')
    expect(n.installTestActive).toBe(true)
    expect(n.machineId).toBe('B1-TM-001')
  })
})
