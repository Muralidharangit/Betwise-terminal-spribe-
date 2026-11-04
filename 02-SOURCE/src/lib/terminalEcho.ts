import Echo from 'laravel-echo'
import Pusher, { type ChannelAuthorizationCallback } from 'pusher-js'
import {
  getShopApiBaseUrl,
  isTerminalRealtimeEnabled,
  PUSHER_APP_CLUSTER,
  PUSHER_APP_KEY,
} from '../config/env'

declare global {
  interface Window {
    Pusher: typeof Pusher
  }
}

type TerminalEcho = Echo<'pusher'>

let echo: TerminalEcho | null = null
let echoKey: string | null = null

export function disconnectTerminalEcho() {
  echo?.disconnect()
  echo = null
  echoKey = null
}

export function connectTerminalEcho(input: {
  machineId: string
  hardwareId: string
}): TerminalEcho | null {
  if (!isTerminalRealtimeEnabled()) {
    return null
  }

  const apiBase = getShopApiBaseUrl()
  const key = `${apiBase}|${input.machineId}|${input.hardwareId}`
  if (echo && echoKey === key) {
    return echo
  }

  disconnectTerminalEcho()
  window.Pusher = Pusher

  echo = new Echo({
    broadcaster: 'pusher',
    key: PUSHER_APP_KEY,
    cluster: PUSHER_APP_CLUSTER,
    forceTLS: true,
    authEndpoint: `${apiBase}/broadcasting/auth/terminal`,
    authorizer: (channel) => ({
      authorize: (socketId: string, callback: ChannelAuthorizationCallback) => {
        void fetch(`${apiBase}/broadcasting/auth/terminal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            socket_id: socketId,
            channel_name: channel.name,
            machine_id: input.machineId,
            device_fingerprint: input.hardwareId,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              callback(new Error(await response.text()), null)
              return
            }
            const data = (await response.json()) as { auth: string }
            callback(null, data)
          })
          .catch((error: unknown) => {
            callback(error instanceof Error ? error : new Error('Terminal channel auth failed'), null)
          })
      },
    }),
  })
  echoKey = key

  return echo
}
