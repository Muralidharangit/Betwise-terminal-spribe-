import { useNavigate } from 'react-router-dom'
import { fetchSession } from '../../api/client'
import { ProviderGamePanel } from '../../components/ProviderGamePanel'
import { getGameById } from '../../games/catalog'
import { getLiveHardwareId } from '../../lib/storage'
import { useMachine } from '../../services/sessionStore'
import { useShallow } from 'zustand/react/shallow'
import { friendlyMessage } from '../../utils/friendlyMessage'

export default function AviatorGame() {
  const navigate = useNavigate()
  const { machineId, balance, setBalance, showAlert } = useMachine(useShallow((s) => ({ machineId: s.machineId, balance: s.balance, setBalance: s.setBalance, showAlert: s.showAlert })))
  const game = getGameById('aviator')

  async function refreshBalance() {
    if (!machineId) return
    try {
      const hardwareId = await getLiveHardwareId()
      const session = await fetchSession(machineId, hardwareId)
      setBalance(session.current_balance)
    } catch {
      /* session poll will catch up */
    }
  }

  if (!game) return null

  return (
    <ProviderGamePanel
      game={game}
      machineId={machineId}
      balance={balance}
      disabled={balance <= 0}
      getHardwareId={getLiveHardwareId}
      onBack={() => navigate('/home')}
      onClosed={() => void refreshBalance()}
      onError={(message) =>
        showAlert({
          tone: 'error',
          title: 'Aviator',
          message: friendlyMessage(message, 'Could not launch Aviator.'),
          autoCloseMs: 0,
        })
      }
    />
  )
}
