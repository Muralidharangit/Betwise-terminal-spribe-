import { create } from 'zustand';
import { blockTapsBriefly } from '../lib/tapGuard';
import type { KioskConfig } from '../types';

type Flash = { tone: 'ok' | 'warn' | 'error'; text: string } | null;

export type KioskAlertState = {
  tone: 'ok' | 'warn' | 'error';
  title: string;
  message: string;
  /** 0 = stay until dismissed */
  autoCloseMs?: number;
} | null;

type MachineState = {
  config: KioskConfig | null;
  /** Laravel machine_id used for API auth */
  machineId: string;
  balance: number;
  lastCashAmount: number | null;
  lastTicketCode: string | null;
  /** How credit was last added: cash note or ticket */
  creditSource: 'cash' | 'ticket' | null;
  statusMessage: Flash;
  alert: KioskAlertState;
  printerWarning: string | null;
  /** Staff hardware test open — do not bill-in or ticket-in. */
  installTestActive: boolean;
  /** Explicit modal when user clicks a game with 0 balance */
  showInsertMoneyModal: boolean;
  setConfig: (c: KioskConfig) => void;
  setMachineId: (id: string) => void;
  setBalance: (balance: number) => void;
  setLastCash: (amount: number | null) => void;
  setLastTicket: (code: string | null) => void;
  setCreditSource: (source: 'cash' | 'ticket' | null) => void;
  setStatus: (flash: Flash) => void;
  showAlert: (alert: NonNullable<KioskAlertState>) => void;
  clearAlert: () => void;
  setPrinterWarning: (msg: string | null) => void;
  setInstallTestActive: (active: boolean) => void;
  setShowInsertMoneyModal: (show: boolean) => void;
};

export const useMachine = create<MachineState>((set, get) => ({
  config: null,
  machineId: '',
  balance: 0,
  lastCashAmount: null,
  lastTicketCode: null,
  creditSource: null,
  statusMessage: null,
  alert: null,
  printerWarning: null,
  installTestActive: false,
  showInsertMoneyModal: false,
  setConfig: (config) => set({ config }),
  setMachineId: (machineId) => set({ machineId }),
  setBalance: (balance) => {
    const val = typeof balance === 'number' ? balance : parseFloat(String(balance ?? 0));
    set({ balance: Number.isFinite(val) ? Math.max(0, val) : 0 });
  },
  setLastCash: (lastCashAmount) => {
    if (lastCashAmount == null) {
      set({ lastCashAmount: null });
    } else {
      const val = typeof lastCashAmount === 'number' ? lastCashAmount : parseFloat(String(lastCashAmount));
      set({ lastCashAmount: Number.isFinite(val) ? Math.max(0, val) : 0 });
    }
  },
  setLastTicket: (lastTicketCode) => set({ lastTicketCode }),
  setCreditSource: (creditSource) => set({ creditSource }),
  setStatus: (statusMessage) => set({ statusMessage }),
  // A new message is always about the latest event, so it replaces the Insert Money pop-up
  showAlert: (alert) => set({ alert, showInsertMoneyModal: false }),
  clearAlert: () => {
    if (get().alert) blockTapsBriefly();
    set({ alert: null });
  },
  setPrinterWarning: (printerWarning) => set({ printerWarning }),
  setInstallTestActive: (installTestActive) => set({ installTestActive }),
  setShowInsertMoneyModal: (showInsertMoneyModal) => {
    if (!showInsertMoneyModal && get().showInsertMoneyModal) blockTapsBriefly();
    set(showInsertMoneyModal ? { showInsertMoneyModal, alert: null } : { showInsertMoneyModal });
  },
}));
