import { invoke } from '@tauri-apps/api/core'

type Level = 'info' | 'warn' | 'error'

/** Console + Tauri terminal log, so kiosk events are visible without DevTools. */
export function uiLog(message: string, level: Level = 'info'): void {
  if (level === 'error') console.error(message)
  else if (level === 'warn') console.warn(message)
  else console.info(message)
  void invoke('frontend_log', { level, message }).catch(() => undefined)
}
