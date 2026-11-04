import { API_ORIGIN } from '../config/env'

export type GameDefinition = {
  id: string
  name: string
  category: string
  description: string
  payout_label: string
  choices: string[]
  icon: string
  accent: string
  /** Poster gradient stops for lobby tiles */
  artFrom: string
  artTo: string
  tagline: string
  /** Local stub bet vs live provider iframe launch */
  kind?: 'local' | 'provider'
  image?: string
  provider?: string
  providerKey?: string
  providerImage?: string
  is_hot?: boolean
  is_jackpot?: boolean
  is_live?: boolean
}

/** Client-side display metadata; server validates all bets / launches. */
export const GAME_CATALOG: GameDefinition[] = [
  {
    id: 'aviator',
    name: 'Aviator',
    category: 'Crash & Instant',
    description: 'Spribe Aviator — live crash game.',
    payout_label: 'Live',
    choices: [],
    icon: '✈️',
    accent: '#ef4444',
    artFrom: '#7f1d1d',
    artTo: '#0f172a',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/AVIATOR.png',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_hot: true,
    is_live: true,
  },
  {
    id: 'dice',
    name: 'Dice',
    category: 'Table Games',
    description: 'Spribe Dice — live crypto dice game.',
    payout_label: 'Live',
    choices: [],
    icon: '🎲',
    accent: '#22c55e',
    artFrom: '#581c87',
    artTo: '#0f172a',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/DICE.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'goal',
    name: 'Goal',
    category: 'Crash & Instant',
    description: 'Spribe Goal — live sports instant game.',
    payout_label: 'Live',
    choices: [],
    icon: '⚽',
    accent: '#22c55e',
    artFrom: '#15803d',
    artTo: '#064e3b',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/SOCCER.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'plinko',
    name: 'Plinko',
    category: 'Crash & Instant',
    description: 'Spribe Plinko — live peg drop game.',
    payout_label: 'Live',
    choices: [],
    icon: '🔺',
    accent: '#06b6d4',
    artFrom: '#0369a1',
    artTo: '#082f49',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/PLINKO.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'mines',
    name: 'Mines',
    category: 'Crash & Instant',
    description: 'Spribe Mines — live minefield cash game.',
    payout_label: 'Live',
    choices: [],
    icon: '💣',
    accent: '#3b82f6',
    artFrom: '#1e40af',
    artTo: '#0f172a',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/MINES.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'hilo',
    name: 'Hilo',
    category: 'Table Games',
    description: 'Spribe Hilo — live higher/lower card game.',
    payout_label: 'Live',
    choices: [],
    icon: '🂡',
    accent: '#f59e0b',
    artFrom: '#b45309',
    artTo: '#451a03',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/HILO.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'keno',
    name: 'Keno',
    category: 'Table Games',
    description: 'Spribe Keno — live lottery game.',
    payout_label: 'Live',
    choices: [],
    icon: '🎱',
    accent: '#ec4899',
    artFrom: '#9d174d',
    artTo: '#1e1b4b',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/KENO.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'miniroulette',
    name: 'Mini Roulette',
    category: 'Table Games',
    description: 'Spribe Mini Roulette — live European style wheel.',
    payout_label: 'Live',
    choices: [],
    icon: '🎯',
    accent: '#10b981',
    artFrom: '#047857',
    artTo: '#022c22',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/MINI-ROULETTE.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'hotline',
    name: 'Hotline',
    category: 'Crash & Instant',
    description: 'Spribe Hotline — live high-speed hot reel game.',
    payout_label: 'Live',
    choices: [],
    icon: '🔥',
    accent: '#1cb03d',
    artFrom: '#1e40af',
    artTo: '#172554',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/HOTLINE.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'balloon',
    name: 'Balloon',
    category: 'Crash & Instant',
    description: 'Spribe Balloon — hold & pump multiplier game.',
    payout_label: 'Live',
    choices: [],
    icon: '🎈',
    accent: '#f43f5e',
    artFrom: '#be123c',
    artTo: '#4c0519',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/BALLON.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'keno80',
    name: 'Multi Keno 80',
    category: 'Table Games',
    description: 'Spribe Keno 80 — 80 ball live instant lottery.',
    payout_label: 'Live',
    choices: [],
    icon: '🎱',
    accent: '#22c55e',
    artFrom: '#15803d',
    artTo: '#2e1065',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/KENO-80.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'pilot',
    name: 'Pilot Chicken',
    category: 'Crash & Instant',
    description: 'Spribe Pilot Chicken — live aviator adventure.',
    payout_label: 'Live',
    choices: [],
    icon: '🐥',
    accent: '#eab308',
    artFrom: '#854d0e',
    artTo: '#1c1917',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/PILOT.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'trader',
    name: 'Trader',
    category: 'Crash & Instant',
    description: 'Spribe Trader — live market prediction game.',
    payout_label: 'Live',
    choices: [],
    icon: '📈',
    accent: '#eab308',
    artFrom: '#713f12',
    artTo: '#1c1917',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/trader.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'crash_plane',
    name: 'Crash Plane',
    category: 'Crash & Instant',
    description: 'Spribe Crash Plane — live multiplier flight game.',
    payout_label: 'Live',
    choices: [],
    icon: '🛩️',
    accent: '#ef4444',
    artFrom: '#991b1b',
    artTo: '#0f172a',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/crash_plane.png',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'lucky_6',
    name: 'Lucky 6',
    category: 'Hot',
    description: 'ExcellentReel Lucky 6 — live provider game.',
    payout_label: 'Live',
    choices: [],
    icon: '🎱',
    accent: '#f97316',
    artFrom: '#9a3412',
    artTo: '#1c1917',
    tagline: 'ExcellentReel',
    kind: 'provider',
    image: '/lobby/lucky6.svg',
    provider: 'ExcellentReel',
    providerKey: 'excellentreel',
  },
  {
    id: '900004',
    name: 'Turbo SportsBook',
    category: 'Sports',
    description: 'Turbo SportsBook — live sports betting.',
    payout_label: 'Live',
    choices: [],
    icon: '🏆',
    accent: '#22c55e',
    artFrom: '#14532d',
    artTo: '#0f172a',
    tagline: 'Turbo Sports',
    kind: 'provider',
    image: '/lobby/sports.svg',
    provider: 'TurboSportsBook',
    providerKey: 'turbosportsbook',
  },
  {
    id: 'sports',
    name: 'Turbo SportsBook',
    category: 'Sports',
    description: 'Turbo SportsBook — live sports betting.',
    payout_label: 'Live',
    choices: [],
    icon: '🏆',
    accent: '#22c55e',
    artFrom: '#14532d',
    artTo: '#0f172a',
    tagline: 'Turbo Sports',
    kind: 'provider',
    image: '/lobby/sports.svg',
    provider: 'TurboSportsBook',
    providerKey: 'turbosportsbook',
  },
  {
    id: 'red_black',
    name: 'Red or Black',
    category: 'Cards',
    description: 'Pick a colour. Win doubles your stake.',
    payout_label: '2×',
    choices: ['RED', 'BLACK'],
    icon: '🂡',
    accent: '#ef4444',
    artFrom: '#7f1d1d',
    artTo: '#111827',
    tagline: 'Local',
    kind: 'local',
    image: '/lobby/red-black.svg',
    provider: 'dummyGame',
    providerKey: 'dummy',
  },
  {
    id: 'coin_flip',
    name: 'Coin Flip',
    category: 'Classic',
    description: 'Heads or tails — 50/50 chance.',
    payout_label: '2×',
    choices: ['HEADS', 'TAILS'],
    icon: '🪙',
    accent: '#f59e0b',
    artFrom: '#92400e',
    artTo: '#1c1917',
    tagline: 'Call it',
  },
  {
    id: 'dice_roll',
    name: 'Lucky Dice',
    category: 'Dice',
    description: 'Pick a number 1–6. Match the roll to win big.',
    payout_label: '5×',
    choices: ['1', '2', '3', '4', '5', '6'],
    icon: '🎲',
    accent: '#22c55e',
    artFrom: '#581c87',
    artTo: '#0f172a',
    tagline: 'Roll for gold',
  },
  {
    id: 'hi_lo',
    name: 'Hi-Lo Dice',
    category: 'Dice',
    description: 'Will the dice land high (4–6) or low (1–3)?',
    payout_label: '2×',
    choices: ['HI', 'LO'],
    icon: '🎯',
    accent: '#06b6d4',
    artFrom: '#155e75',
    artTo: '#082f49',
    tagline: 'High or low',
  },
  {
    id: 'odd_even',
    name: 'Odd or Even',
    category: 'Numbers',
    description: 'Roll 1–10. Predict odd or even.',
    payout_label: '2×',
    choices: ['ODD', 'EVEN'],
    icon: '✦',
    accent: '#818cf8',
    artFrom: '#312e81',
    artTo: '#0f172a',
    tagline: 'Pick the parity',
  },
  {
    id: 'roulette',
    name: 'Mini Roulette',
    category: 'Roulette',
    description: 'Red, black, or green. Green pays more.',
    payout_label: '8×',
    choices: ['RED', 'BLACK', 'GREEN'],
    icon: '◉',
    accent: '#22c55e',
    artFrom: '#14532d',
    artTo: '#450a0a',
    tagline: 'Spin the wheel',
  },
  {
    id: 'card_suit',
    name: 'Card Suit',
    category: 'Cards',
    description: 'Pick the suit of the hidden card.',
    payout_label: '3.5×',
    choices: ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'],
    icon: '🂠',
    accent: '#ec4899',
    artFrom: '#9d174d',
    artTo: '#1e1b4b',
    tagline: 'Guess the suit',
  },
  {
    id: 'goal_kick',
    name: 'Goal Kick',
    category: 'Sports',
    description: 'Where will the striker shoot?',
    payout_label: '3×',
    choices: ['LEFT', 'CENTER', 'RIGHT'],
    icon: '⚽',
    accent: '#14b8a6',
    artFrom: '#115e59',
    artTo: '#052e16',
    tagline: 'Pick the corner',
  },
  {
    id: 'lucky_wheel',
    name: 'Lucky Wheel',
    category: 'Wheel',
    description: 'Pick a segment A–E on the wheel.',
    payout_label: '4×',
    choices: ['A', 'B', 'C', 'D', 'E'],
    icon: '✴',
    accent: '#86efac',
    artFrom: '#6b21a8',
    artTo: '#1e1b4b',
    tagline: 'Fortune spin',
  },
  {
    id: 'lucky_nine',
    name: 'Lucky 9',
    category: 'Jackpot',
    description: 'Pick a digit 0–9. Hit it for jackpot.',
    payout_label: '8×',
    choices: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    icon: '💎',
    accent: '#eab308',
    artFrom: '#854d0e',
    artTo: '#1c1917',
    tagline: 'Hit the digit',
  },
]

/** Home tiles — assigned shop games + local Red or Black. */
export const HOME_GAME_IDS = ['aviator', 'lucky_6', '900004', 'red_black'] as const

/** All Games / Provider — assigned shop games only. */
export const ALL_GAME_IDS = ['aviator', 'lucky_6', '900004'] as const

/** Lobby display order — unused stubs stay in GAME_CATALOG for later. */
export const LOBBY_GAME_IDS = HOME_GAME_IDS

export type LobbyProvider = {
  key: string
  name: string
  logo: string
  tone: 'dark' | 'light'
  gameIds: readonly string[]
  games?: GameDefinition[]
}

export const SPRIBE_LOCAL_IMAGES: Record<string, string> = {
  aviator: '/assets/games/SPRIBE/AVIATOR.png',
  dice: '/assets/games/SPRIBE/DICE.jpg',
  goal: '/assets/games/SPRIBE/SOCCER.jpg',
  soccer: '/assets/games/SPRIBE/SOCCER.jpg',
  plinko: '/assets/games/SPRIBE/PLINKO.jpg',
  mines: '/assets/games/SPRIBE/MINES.jpg',
  hilo: '/assets/games/SPRIBE/HILO.jpg',
  hi_lo: '/assets/games/SPRIBE/HILO.jpg',
  keno: '/assets/games/SPRIBE/KENO.jpg',
  miniroulette: '/assets/games/SPRIBE/MINI-ROULETTE.jpg',
  mini_roulette: '/assets/games/SPRIBE/MINI-ROULETTE.jpg',
  roulette: '/assets/games/SPRIBE/MINI-ROULETTE.jpg',
  hotline: '/assets/games/SPRIBE/HOTLINE.jpg',
  balloon: '/assets/games/SPRIBE/BALLON.jpg',
  ballon: '/assets/games/SPRIBE/BALLON.jpg',
  keno80: '/assets/games/SPRIBE/KENO-80.jpg',
  keno_80: '/assets/games/SPRIBE/KENO-80.jpg',
  multikeno: '/assets/games/SPRIBE/KENO-80.jpg',
  pilot: '/assets/games/SPRIBE/PILOT.jpg',
  pilotchicken: '/assets/games/SPRIBE/PILOT.jpg',
  crash_plane: '/assets/games/SPRIBE/crash_plane.png',
  crashplane: '/assets/games/SPRIBE/crash_plane.png',
  trader: '/assets/games/SPRIBE/trader.jpg',
}

export const LOBBY_PROVIDERS: LobbyProvider[] = [
  {
    key: 'spribe',
    name: 'Spribe',
    logo: '/lobby/spribe.svg',
    tone: 'dark',
    gameIds: [
      'aviator',
      'dice',
      'goal',
      'plinko',
      'mines',
      'hilo',
      'keno',
      'miniroulette',
      'hotline',
      'balloon',
      'keno80',
      'pilot',
      'crash_plane',
      'trader',
    ],
  },
  {
    key: 'excellentreel',
    name: 'ExcellentReel',
    logo: '/lobby/excellentreel.svg',
    tone: 'light',
    gameIds: ['lucky_6'],
  },
  {
    key: 'turbosportsbook',
    name: 'Turbo Sports',
    logo: '/lobby/turbo.svg',
    tone: 'light',
    gameIds: ['900004'],
  },
]

function requireGames(ids: readonly string[]): GameDefinition[] {
  return ids.map((id) => {
    const game = GAME_CATALOG.find((g) => g.id === id)
    if (!game) {
      throw new Error(`Lobby game missing from catalog: ${id}`)
    }
    return game
  })
}

export const LOBBY_GAMES: GameDefinition[] = requireGames(HOME_GAME_IDS)
export const HOME_GAMES: GameDefinition[] = LOBBY_GAMES
export const ALL_GAMES: GameDefinition[] = requireGames(ALL_GAME_IDS)

const GAME_BY_ID = new Map(GAME_CATALOG.map((g) => [g.id, g]))

export function getGameById(id: string): GameDefinition | undefined {
  return GAME_BY_ID.get(id) ?? (id === 'sports' ? GAME_BY_ID.get('900004') : id === '900004' ? GAME_BY_ID.get('sports') : undefined)
}

export function gamesForProvider(provider: LobbyProvider): GameDefinition[] {
  if (provider.games?.length) {
    return provider.games
  }
  return requireGames(provider.gameIds)
}

export function providerKeyFromName(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (key.includes('spribe')) return 'spribe'
  if (key.includes('excellent')) return 'excellentreel'
  if (key.includes('turbo')) return 'turbosportsbook'
  if (key.includes('dummy')) return 'dummy'
  return key || 'provider'
}

export const GAME_FALLBACK_IMAGE = '/assets/img/placeholder.png'

export const SPRIBE_CATALOG_GAMES: GameDefinition[] = [
  {
    id: 'aviator',
    name: 'Aviator',
    category: 'Crash & Instant',
    description: 'Spribe Aviator — live crash game.',
    payout_label: 'Live',
    choices: [],
    icon: '✈️',
    accent: '#ef4444',
    artFrom: '#7f1d1d',
    artTo: '#0f172a',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/AVIATOR.png',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_hot: true,
    is_live: true,
  },
  {
    id: 'dice',
    name: 'Dice',
    category: 'Table Games',
    description: 'Spribe Dice — live crypto dice game.',
    payout_label: 'Live',
    choices: [],
    icon: '🎲',
    accent: '#22c55e',
    artFrom: '#581c87',
    artTo: '#0f172a',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/DICE.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'goal',
    name: 'Goal',
    category: 'Crash & Instant',
    description: 'Spribe Goal — live sports instant game.',
    payout_label: 'Live',
    choices: [],
    icon: '⚽',
    accent: '#22c55e',
    artFrom: '#15803d',
    artTo: '#064e3b',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/SOCCER.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'plinko',
    name: 'Plinko',
    category: 'Crash & Instant',
    description: 'Spribe Plinko — live peg drop game.',
    payout_label: 'Live',
    choices: [],
    icon: '🔺',
    accent: '#06b6d4',
    artFrom: '#0369a1',
    artTo: '#082f49',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/PLINKO.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'mines',
    name: 'Mines',
    category: 'Crash & Instant',
    description: 'Spribe Mines — live minefield cash game.',
    payout_label: 'Live',
    choices: [],
    icon: '💣',
    accent: '#3b82f6',
    artFrom: '#1e40af',
    artTo: '#0f172a',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/MINES.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'hilo',
    name: 'Hilo',
    category: 'Table Games',
    description: 'Spribe Hilo — live higher/lower card game.',
    payout_label: 'Live',
    choices: [],
    icon: '🂡',
    accent: '#f59e0b',
    artFrom: '#b45309',
    artTo: '#451a03',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/HILO.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'keno',
    name: 'Keno',
    category: 'Table Games',
    description: 'Spribe Keno — live lottery game.',
    payout_label: 'Live',
    choices: [],
    icon: '🎱',
    accent: '#ec4899',
    artFrom: '#9d174d',
    artTo: '#1e1b4b',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/KENO.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'miniroulette',
    name: 'Mini Roulette',
    category: 'Table Games',
    description: 'Spribe Mini Roulette — live European style wheel.',
    payout_label: 'Live',
    choices: [],
    icon: '🎯',
    accent: '#10b981',
    artFrom: '#047857',
    artTo: '#022c22',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/MINI-ROULETTE.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'hotline',
    name: 'Hotline',
    category: 'Crash & Instant',
    description: 'Spribe Hotline — live high-speed hot reel game.',
    payout_label: 'Live',
    choices: [],
    icon: '🔥',
    accent: '#1cb03d',
    artFrom: '#1e40af',
    artTo: '#172554',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/HOTLINE.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'balloon',
    name: 'Balloon',
    category: 'Crash & Instant',
    description: 'Spribe Balloon — hold & pump multiplier game.',
    payout_label: 'Live',
    choices: [],
    icon: '🎈',
    accent: '#f43f5e',
    artFrom: '#be123c',
    artTo: '#4c0519',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/BALLON.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'keno80',
    name: 'Multi Keno 80',
    category: 'Table Games',
    description: 'Spribe Keno 80 — 80 ball live instant lottery.',
    payout_label: 'Live',
    choices: [],
    icon: '🎱',
    accent: '#22c55e',
    artFrom: '#15803d',
    artTo: '#2e1065',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/KENO-80.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'pilot',
    name: 'Pilot Chicken',
    category: 'Crash & Instant',
    description: 'Spribe Pilot Chicken — live aviator adventure.',
    payout_label: 'Live',
    choices: [],
    icon: '🐥',
    accent: '#eab308',
    artFrom: '#854d0e',
    artTo: '#1c1917',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/PILOT.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'trader',
    name: 'Trader',
    category: 'Crash & Instant',
    description: 'Spribe Trader — live market prediction game.',
    payout_label: 'Live',
    choices: [],
    icon: '📈',
    accent: '#eab308',
    artFrom: '#713f12',
    artTo: '#1c1917',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/trader.jpg',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
  {
    id: 'crash_plane',
    name: 'Crash Plane',
    category: 'Crash & Instant',
    description: 'Spribe Crash Plane — live multiplier flight game.',
    payout_label: 'Live',
    choices: [],
    icon: '🛩️',
    accent: '#ef4444',
    artFrom: '#991b1b',
    artTo: '#0f172a',
    tagline: 'Spribe',
    kind: 'provider',
    image: '/assets/games/SPRIBE/crash_plane.png',
    provider: 'Spribe',
    providerKey: 'spribe',
    is_live: true,
  },
]

export function getSpribeImage(nameOrId?: string): string | undefined {
  if (!nameOrId) return undefined
  const clean = nameOrId.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!clean) return undefined

  if (clean.includes('aviator')) return '/assets/games/SPRIBE/AVIATOR.png'
  if (clean.includes('ballon') || clean.includes('balloon')) return '/assets/games/SPRIBE/BALLON.jpg'
  if (clean.includes('crash') || clean.includes('plane')) return '/assets/games/SPRIBE/crash_plane.png'
  if (clean.includes('dice')) return '/assets/games/SPRIBE/DICE.jpg'
  if (clean.includes('hilo') || clean.includes('highlow') || clean.includes('helo')) return '/assets/games/SPRIBE/HILO.jpg'
  if (clean.includes('hotline')) return '/assets/games/SPRIBE/HOTLINE.jpg'
  if (clean.includes('keno80') || clean.includes('multikeno')) return '/assets/games/SPRIBE/KENO-80.jpg'
  if (clean.includes('keno')) return '/assets/games/SPRIBE/KENO.jpg'
  if (clean.includes('mine')) return '/assets/games/SPRIBE/MINES.jpg'
  if (clean.includes('roulette') || clean.includes('miniroulette')) return '/assets/games/SPRIBE/MINI-ROULETTE.jpg'
  if (clean.includes('pilot') || clean.includes('chicken')) return '/assets/games/SPRIBE/PILOT.jpg'
  if (clean.includes('plinko')) return '/assets/games/SPRIBE/PLINKO.jpg'
  if (clean.includes('soccer') || clean.includes('goal')) return '/assets/games/SPRIBE/SOCCER.jpg'
  if (clean.includes('trader')) return '/assets/games/SPRIBE/trader.jpg'

  return SPRIBE_LOCAL_IMAGES[clean]
}

export function hydrateCatalogGame(item: {
  id: string
  name: string
  category?: string
  description?: string
  payout_label?: string
  choices?: string[]
  kind?: 'local' | 'provider'
  provider?: string
  image?: string | null
  image_url?: string | null
  game_image?: string | null
  images?: {
    image?: string | null
    logo?: string | null
    banner?: string | null
    thumbnail?: string | null
  } | null
  provider_image?: string | null
}): GameDefinition {
  const isTurbo = item.id === '900004' || item.id === 'sports' || item.name?.toLowerCase().includes('turbo sports')
  const local = getGameById(item.id)
  const isLocalKind = item.kind === 'local' || (!item.provider && !item.kind && local?.kind === 'local')
  const provider = isTurbo
    ? 'TurboSportsBook'
    : item.provider ?? local?.provider ?? (isLocalKind ? 'dummyGame' : item.category ?? 'Provider')

  // Check if this game matches any dedicated Spribe asset
  const spribeImg = getSpribeImage(item.id) || getSpribeImage(item.name) || (local ? getSpribeImage(local.name) : undefined)

  // If this is a Spribe game, ALWAYS strictly use the guaranteed local static image!
  let rawImg: string | undefined
  if (spribeImg) {
    rawImg = spribeImg
  } else {
    // 1. Check API provided images
    const apiImage =
      item.image ||
      item.image_url ||
      item.game_image ||
      (item as Record<string, unknown>).imageUrl as string ||
      (item as Record<string, unknown>).gameImage as string ||
      (item as Record<string, unknown>).banner as string ||
      (item as Record<string, unknown>).thumbnail as string ||
      (item as Record<string, unknown>).cover as string ||
      (item as Record<string, unknown>).poster as string ||
      (item as Record<string, unknown>).icon as string ||
      item.images?.image ||
      item.images?.thumbnail ||
      item.images?.banner ||
      item.images?.logo

    rawImg = apiImage || local?.image
  }

  if (typeof rawImg === 'string') {
    // Unescape JSON slashes if present (e.g., https:\/\/...)
    rawImg = rawImg.replace(/\\\//g, '/').trim()
    if (rawImg === '' || rawImg === 'null' || rawImg === 'undefined') {
      rawImg = undefined
    } else if (rawImg.startsWith('//')) {
      rawImg = `https:${rawImg}`
    } else if (
      !rawImg.startsWith('http://') &&
      !rawImg.startsWith('https://') &&
      !rawImg.startsWith('/assets/') &&
      !rawImg.startsWith('/lobby/') &&
      !rawImg.startsWith('/arena/')
    ) {
      const serverOrigin = (API_ORIGIN || 'https://staging.iccpanel.com/api').replace(/\/api\/?$/, '')
      rawImg = rawImg.startsWith('/')
        ? `${serverOrigin}${rawImg}`
        : `${serverOrigin}/${rawImg}`
    }
  }

  const finalImage = (rawImg && typeof rawImg === 'string' && rawImg.trim() !== '') ? rawImg : GAME_FALLBACK_IMAGE

  return {
    id: isTurbo ? '900004' : item.id,
    name: isTurbo ? 'Turbo SportsBook' : item.name || local?.name || item.id,
    category: item.category ?? local?.category ?? (isTurbo ? 'Sports' : 'Provider'),
    description: item.description ?? local?.description ?? '',
    payout_label: item.payout_label ?? local?.payout_label ?? 'Live',
    choices: item.choices ?? local?.choices ?? [],
    icon: local?.icon ?? (isTurbo ? '🏆' : '▶'),
    accent: local?.accent ?? (isTurbo ? '#22c55e' : '#e11d48'),
    artFrom: local?.artFrom ?? (isTurbo ? '#14532d' : '#111827'),
    artTo: local?.artTo ?? '#0f172a',
    tagline: local?.tagline ?? provider,
    kind: isLocalKind ? 'local' : (item.kind ?? local?.kind ?? 'provider'),
    image: finalImage,
    provider,
    providerKey: local?.providerKey ?? providerKeyFromName(provider),
    providerImage: item.provider_image || undefined,
  }
}

export function lobbyProviderFromApi(item: {
  id: number
  provider: string
  images?: { logo?: string | null; name?: string | null }
}): LobbyProvider {
  const key = `${providerKeyFromName(item.provider)}-${item.id}`
  const meta = LOBBY_PROVIDERS.find((row) => row.key === providerKeyFromName(item.provider))
  return {
    key,
    name: item.provider,
    logo: item.images?.logo || item.images?.name || meta?.logo || '/lobby/turbo.svg',
    tone: meta?.tone ?? (providerKeyFromName(item.provider) === 'spribe' ? 'dark' : 'light'),
    gameIds: [],
    games: [],
  }
}

export function providersFromAssignedGames(games: GameDefinition[]): LobbyProvider[] {
  const grouped = new Map<string, LobbyProvider>()

  for (const game of games) {
    if (game.kind === 'local') continue
    const key = game.providerKey ?? providerKeyFromName(game.provider ?? game.name)
    const meta = LOBBY_PROVIDERS.find((item) => item.key === key)
    const existing = grouped.get(key)
    if (existing) {
      existing.games = [...(existing.games ?? []), game]
      continue
    }
    grouped.set(key, {
      key,
      name: meta?.name ?? game.provider ?? game.name,
      logo: game.providerImage || meta?.logo || '/lobby/turbo.svg',
      tone: meta?.tone ?? 'light',
      gameIds: [game.id],
      games: [game],
    })
  }

  return LOBBY_PROVIDERS.map((meta) => grouped.get(meta.key)).filter(
    (item): item is LobbyProvider => Boolean(item),
  ).concat(
    [...grouped.values()].filter((item) => !LOBBY_PROVIDERS.some((meta) => meta.key === item.key)),
  )
}

export function choiceLabel(choice: string): string {
  const labels: Record<string, string> = {
    HEADS: 'Heads',
    TAILS: 'Tails',
    HI: 'High (4–6)',
    LO: 'Low (1–3)',
    HEARTS: '♥ Hearts',
    DIAMONDS: '♦ Diamonds',
    CLUBS: '♣ Clubs',
    SPADES: '♠ Spades',
    LEFT: '← Left',
    CENTER: 'Center',
    RIGHT: 'Right →',
    RED: 'Red',
    BLACK: 'Black',
    GREEN: 'Green',
    ODD: 'Odd',
    EVEN: 'Even',
  }
  return labels[choice] ?? choice
}
