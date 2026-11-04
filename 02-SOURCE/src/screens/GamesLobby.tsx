import { memo, useState } from 'react'
import { BettingLobby } from '../components/BettingLobby'
import { GamePlayPanel } from '../components/GamePlayPanel'
import { ProviderGamePanel } from '../components/ProviderGamePanel'
import type { GameDefinition } from '../games/catalog'
import { getLiveHardwareId } from '../lib/storage'
import { useMachine } from '../services/sessionStore'
import { friendlyMessage } from '../utils/friendlyMessage'
import { useShallow } from 'zustand/react/shallow'

function GamesLobby() {
  const { balance, machineId, showAlert, setBalance, setShowInsertMoneyModal } = useMachine(
    useShallow((s) => ({
      balance: s.balance,
      machineId: s.machineId,
      showAlert: s.showAlert,
      setBalance: s.setBalance,
      setShowInsertMoneyModal: s.setShowInsertMoneyModal,
    })),
  )
  const [selected, setSelected] = useState<GameDefinition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const locked = balance <= 0

  function selectGame(game: GameDefinition) {
    if (locked) {
      setShowInsertMoneyModal(true)
      return
    }
    setError(null)
    setSelected(game)
  }

  // If a game is launched, open it as a full-screen dedicated game page
  if (selected) {
    if (selected.kind === 'provider') {
      return (
        <ProviderGamePanel
          game={selected}
          machineId={machineId}
          balance={balance}
          disabled={locked}
          onBack={() => setSelected(null)}
          onError={(message) => {
            const plain = friendlyMessage(
              message,
              'This game could not be opened right now. Please try again or pick another game.',
            )
            setError(plain)
            showAlert({
              tone: 'error',
              title: 'Game could not open',
              message: plain,
              autoCloseMs: 0,
            })
          }}
          onClosed={() => setSelected(null)}
          getHardwareId={getLiveHardwareId}
        />
      )
    }

    return (
      <GamePlayPanel
        game={selected}
        machineId={machineId}
        balance={balance}
        disabled={locked}
        onBack={() => setSelected(null)}
        onBetComplete={(result) => setBalance(result.current_balance)}
        onError={(message) => {
          const plain = friendlyMessage(message, 'The bet could not be placed. Please try again.')
          setError(plain)
          showAlert({
            tone: 'error',
            title: 'Bet not placed',
            message: plain,
            autoCloseMs: 0,
          })
        }}
        getHardwareId={getLiveHardwareId}
      />
    )
  }

  return (
    <div className="arena-shop-lobby">
      {error ? <div className="play-error-banner">{error}</div> : null}
      <BettingLobby
        disabled={locked}
        waitingForCoins={locked}
        onSelect={selectGame}
        onLeaveGame={() => {
          setError(null)
          setSelected(null)
        }}
      />
    </div>
  )
}

export default memo(GamesLobby)
