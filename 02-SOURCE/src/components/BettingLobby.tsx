import { useEffect, type ReactNode } from 'react'
import { GAME_FALLBACK_IMAGE, HOME_GAMES, type GameDefinition } from '../games/catalog'
import { useShopProviders } from '../hooks/useShopProviders'
import { TopPromoBannerSlider } from './TopPromoBannerSlider'

type Props = {
  disabled: boolean
  onSelect: (game: GameDefinition) => void
  waitingForCoins?: boolean
  cashOutPending?: boolean
  offline?: boolean
  playSlot?: ReactNode
  onLeaveGame?: () => void
  onCashOut?: () => void
}

type SpribePickItem = {
  id: string
  name: string
  displayTitle: string
  actionText: string
  image: string
  themeClass: string
  /** Spans both grid rows (fills the 14th slot of the 7×2 grid). */
  hero?: boolean
}

const SPRIBE_FEATURED_PICKS: SpribePickItem[] = [
  // Popular order: Aviator → Pilot (Chicken) → Mines → then other famous titles
  { id: 'aviator', name: 'Aviator', displayTitle: 'AVIATOR', actionText: 'FLY NOW', image: '/assets/games/SPRIBE/AVIATOR-HERO.jpg?v=aviatorhq1', themeClass: 'card-theme-aviator', hero: true },
  { id: 'pilot', name: 'Pilot Chicken', displayTitle: 'PILOT CHICKEN', actionText: 'FLY NOW', image: '/assets/games/SPRIBE/PILOT-HQ.jpg?v=cssTitle34', themeClass: 'card-theme-pilot' },
  { id: 'mines', name: 'Mines', displayTitle: 'MINES', actionText: 'MINE NOW', image: '/assets/games/SPRIBE/MINES-HQ.jpg?v=minesgrid1', themeClass: 'card-theme-mines' },
  { id: 'plinko', name: 'Plinko', displayTitle: 'PLINKO', actionText: 'DROP NOW', image: '/assets/games/SPRIBE/PLINKO-HQ.jpg?v=cssTitle34', themeClass: 'card-theme-plinko' },
  { id: 'dice', name: 'Dice', displayTitle: 'DICE', actionText: 'ROLL NOW', image: '/assets/games/SPRIBE/DICE-HQ.jpg?v=cssTitle34', themeClass: 'card-theme-dice' },
  { id: 'goal', name: 'Goal', displayTitle: 'GOAL', actionText: 'KICK NOW', image: '/assets/games/SPRIBE/GOAL-HQ.jpg?v=cssTitle34', themeClass: 'card-theme-goal' },
  { id: 'hilo', name: 'Hi-Lo', displayTitle: 'HI-LO', actionText: 'GUESS NOW', image: '/assets/games/SPRIBE/HILO-HQ.jpg?v=cssTitle34', themeClass: 'card-theme-hilo' },
  { id: 'keno', name: 'Keno', displayTitle: 'KENO', actionText: 'PICK NOW', image: '/assets/games/SPRIBE/KENO-HQ.jpg?v=kenoclean1', themeClass: 'card-theme-keno' },
  { id: 'balloon', name: 'Balloon', displayTitle: 'BALLOON', actionText: 'PUMP NOW', image: '/assets/games/SPRIBE/BALLOON-HQ.jpg?v=cssTitle34', themeClass: 'card-theme-balloon' },
  { id: 'miniroulette', name: 'Mini Roulette', displayTitle: 'MINI ROULETTE', actionText: 'SPIN NOW', image: '/assets/games/SPRIBE/MINI-ROULETTE-HQ.jpg?v=roulette3d1', themeClass: 'card-theme-wheel' },
  { id: 'hotline', name: 'Hotline', displayTitle: 'HOTLINE', actionText: 'SPIN NOW', image: '/assets/games/SPRIBE/HOTLINE-HQ.jpg?v=cssTitle34', themeClass: 'card-theme-hotline' },
  { id: 'keno80', name: 'Keno 80', displayTitle: 'KENO 80', actionText: 'PICK NOW', image: '/assets/games/SPRIBE/KENO-80-HQ.jpg?v=keno80betbar1', themeClass: 'card-theme-keno80' },
  { id: 'trader', name: 'Trader', displayTitle: 'TRADER', actionText: 'TRADE NOW', image: '/assets/games/SPRIBE/TRADER-HQ.jpg?v=trader3d1', themeClass: 'card-theme-trader' },
]

function SpribeFeaturedSlider({
  disabled,
  catalogGames,
  onSelect,
}: {
  disabled: boolean
  catalogGames: GameDefinition[]
  onSelect: (game: GameDefinition) => void
}) {
  const resolveGame = (pick: SpribePickItem): GameDefinition => {
    const qName = pick.name.toLowerCase()
    const qId = pick.id.toLowerCase()
    const match = catalogGames.find(
      (g) =>
        g.id.toLowerCase() === qId ||
        g.name.toLowerCase() === qName ||
        (qId === 'miniroulette' &&
          (g.id.toLowerCase().includes('roulette') || g.name.toLowerCase().includes('wheel'))) ||
        (qId === 'keno' &&
          (g.id.toLowerCase().includes('keno') || g.name.toLowerCase().includes('kino'))) ||
        (qId === 'balloon' &&
          (g.id.toLowerCase().includes('ballon') || g.name.toLowerCase().includes('balloon'))) ||
        (qId === 'pilot' &&
          (g.id.toLowerCase().includes('pilot') || g.name.toLowerCase().includes('chicken'))) ||
        (g.provider?.toLowerCase().includes('spribe') && g.name.toLowerCase().includes(qName)),
    )
    if (match) {
      return {
        ...match,
        image: pick.image || match.image,
      }
    }

    return {
      id: pick.id,
      name: pick.displayTitle || pick.name,
      category: 'Crash & Instant',
      description: `Spribe ${pick.name} — live provider game.`,
      payout_label: 'LIVE',
      choices: [],
      icon: '🎮',
      accent: '#ef4444',
      artFrom: '#0c2748',
      artTo: '#0b041a',
      tagline: 'Spribe',
      kind: 'provider',
      provider: 'Spribe',
      providerKey: 'spribe',
      is_live: true,
      image: pick.image || GAME_FALLBACK_IMAGE,
    }
  }

  return (
    <div className="spribe-showcase-master">
      <div className="spribe-section-top-header">
        <div className="spribe-section-title-wrap">
          <span className="spribe-section-coin-icon">🪙</span>
          <span className="spribe-section-title">Spribe Games</span>
          <span className="spribe-header-pill">VERIFIED PROVIDER</span>
        </div>
      </div>

      <div className="spribe-showcase-body">
        <div className="spribe-showcase-grid spribe-showcase-grid-6">
          {SPRIBE_FEATURED_PICKS.map((pick) => {
            const game = resolveGame(pick)

            return (
              <div
                key={pick.id}
                className={`spribe-poster-card ${pick.themeClass}${pick.hero ? ' is-hero' : ''}${disabled ? ' is-disabled' : ''}`}
                onClick={() => onSelect(game)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(game)
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Launch ${pick.displayTitle}`}
              >
                <div className="spribe-poster-badge-row">
                  <span className="spribe-poster-live-tag">LIVE</span>
                </div>

                <div className="spribe-poster-art-wrap">
                  <img
                    src={pick.image || GAME_FALLBACK_IMAGE}
                    alt={pick.displayTitle}
                    className="spribe-poster-img"
                    loading={pick.hero ? 'eager' : 'lazy'}
                    fetchPriority={pick.hero ? 'high' : 'auto'}
                    decoding="async"
                    onError={(e) => {
                      const target = e.currentTarget
                      target.onerror = null
                      target.src = GAME_FALLBACK_IMAGE
                    }}
                  />
                </div>

                <div className="spribe-poster-nameplate">
                  <span className="spribe-poster-title">{pick.name}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function BettingLobby({
  disabled,
  onSelect,
  waitingForCoins: _waitingForCoins = false,
  cashOutPending = false,
  offline = false,
  playSlot,
}: Props) {
  const { allGames, allPage, allLoading, allError, loadAllGames } = useShopProviders()

  useEffect(() => {
    if (allPage === 0 && !allLoading && !allError) {
      void loadAllGames(1)
    }
  }, [allPage, allLoading, allError, loadAllGames])

  const catalogGames = allGames.length > 0 ? allGames : HOME_GAMES

  // Cash-in waiting strip removed from lobby — promo banners stay clean.
  // Keep only lock / offline alerts that block play.
  const statusMessage = cashOutPending
    ? 'Cash-out pending — collect at the cashier. Games are locked.'
    : offline
      ? 'Connection lost — waiting to reconnect…'
        : null

  return (
    <div
      className={`winbet-casino-catalog-wrapper kiosk-one-screen container-fluid px-2 px-md-3${disabled ? ' game-lobby-disabled' : ''}`}
    >
      {statusMessage && !playSlot ? (
        <div
          className={`lobby-status-banner${cashOutPending ? ' is-cashout' : ''}${offline ? ' is-offline' : ''}`}
          role="status"
        >
          {statusMessage}
        </div>
      ) : null}

      {!playSlot ? (
        <TopPromoBannerSlider
          disabled={disabled}
          catalogGames={catalogGames}
          onSelect={onSelect}
        />
      ) : null}

      {!playSlot ? (
        <SpribeFeaturedSlider
          disabled={disabled}
          catalogGames={catalogGames}
          onSelect={onSelect}
        />
      ) : null}

      {playSlot ? (
        <div className="catalog-master-card">
          <div className="lobby-pane lobby-pane-play">{playSlot}</div>
        </div>
      ) : null}
    </div>
  )
}
