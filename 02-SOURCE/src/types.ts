export type KioskConfig = {
  API_URL: string
  Terminal_ID: string
  Printer_Name: string
  BillAcceptor_Port: string
  CoinAcceptor_Port: string
  AdminPassword: string
  Currency: string
  CurrencySymbol: string
  SessionTimeoutSeconds: number
  DepositRetryIntervalMs: number
  DepositMaxRetries: number
  KioskLockdown: boolean
  Site_Name?: string
  PC_Name?: string
}
