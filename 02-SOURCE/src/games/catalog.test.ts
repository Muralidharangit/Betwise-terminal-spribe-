import { describe, expect, it } from 'vitest'
import {
  ALL_GAMES,
  GAME_CATALOG,
  GAME_FALLBACK_IMAGE,
  getGameById,
  getSpribeImage,
  hydrateCatalogGame,
  LOBBY_GAMES,
  LOBBY_PROVIDERS,
  providersFromAssignedGames,
  SPRIBE_CATALOG_GAMES,
  choiceLabel,
} from './catalog'

describe('static catalog integrity', () => {
  it('has unique game ids', () => {
    const ids = GAME_CATALOG.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every provider gameId exists in the catalog', () => {
    for (const p of LOBBY_PROVIDERS) {
      for (const id of p.gameIds) {
        expect(GAME_CATALOG.find((g) => g.id === id), `${p.key}/${id}`).toBeDefined()
      }
    }
  })

  it('lobby lists resolve without throwing', () => {
    expect(LOBBY_GAMES.length).toBeGreaterThan(0)
    expect(ALL_GAMES.length).toBeGreaterThan(0)
  })

  it('every Spribe showcase game has a local image under /assets', () => {
    expect(SPRIBE_CATALOG_GAMES.length).toBeGreaterThanOrEqual(13)
    for (const g of SPRIBE_CATALOG_GAMES) {
      expect(g.image, g.id).toMatch(/^\/assets\//)
      expect(g.provider).toBe('Spribe')
    }
  })

  it('getGameById maps sports aliases both ways', () => {
    expect(getGameById('900004')?.id).toBe('900004')
    expect(getGameById('sports')).toBeDefined()
    expect(getGameById('does-not-exist')).toBeUndefined()
  })
})

describe('getSpribeImage', () => {
  it.each([
    ['Aviator', '/assets/games/SPRIBE/AVIATOR.png'],
    ['pilot', '/assets/games/SPRIBE/PILOT.jpg'],
    ['Pilot Chicken', '/assets/games/SPRIBE/PILOT.jpg'],
    ['Mini Roulette', '/assets/games/SPRIBE/MINI-ROULETTE.jpg'],
    ['keno80', '/assets/games/SPRIBE/KENO-80.jpg'],
    ['Keno', '/assets/games/SPRIBE/KENO.jpg'],
    ['Hi-Lo', '/assets/games/SPRIBE/HILO.jpg'],
    ['Goal', '/assets/games/SPRIBE/SOCCER.jpg'],
  ])('%s → %s', (name, img) => {
    expect(getSpribeImage(name)).toBe(img)
  })
  it('unknown names return undefined', () => {
    expect(getSpribeImage('Starburst')).toBeUndefined()
    expect(getSpribeImage('')).toBeUndefined()
    expect(getSpribeImage(undefined)).toBeUndefined()
  })
})

describe('hydrateCatalogGame (API → lobby card)', () => {
  it('Spribe games always use the local image even if the API sends one', () => {
    const g = hydrateCatalogGame({ id: 'x1', name: 'Aviator', provider: 'Spribe', image: 'https://cdn.example/aviator.png' })
    expect(g.image).toBe('/assets/games/SPRIBE/AVIATOR.png')
    expect(g.kind).toBe('provider')
    expect(g.providerKey).toBe('spribe')
  })

  it('unescapes JSON slashes and resolves relative server paths', () => {
    const a = hydrateCatalogGame({ id: 'g1', name: 'Book of Ra', provider: 'Novomatic', image: 'https:\\/\\/cdn.example\\/ra.png' })
    expect(a.image).toBe('https://cdn.example/ra.png')
    const b = hydrateCatalogGame({ id: 'g2', name: 'Slot', provider: 'Prov', image: 'storage/games/slot.png' })
    expect(b.image).toMatch(/^https?:\/\/.+\/storage\/games\/slot\.png$/)
    const c = hydrateCatalogGame({ id: 'g3', name: 'Slot', provider: 'Prov', image: '//cdn.example/x.png' })
    expect(c.image).toBe('https://cdn.example/x.png')
  })

  it('falls back to the placeholder when no image is usable', () => {
    for (const img of [null, '', 'null', 'undefined']) {
      const g = hydrateCatalogGame({ id: 'g9', name: 'No Art', provider: 'Prov', image: img })
      expect(g.image, String(img)).toBe(GAME_FALLBACK_IMAGE)
    }
  })

  it('normalises Turbo Sports under id 900004', () => {
    const g = hydrateCatalogGame({ id: 'sports', name: 'Turbo Sports Book' })
    expect(g.id).toBe('900004')
    expect(g.name).toBe('Turbo SportsBook')
    expect(g.provider).toBe('TurboSportsBook')
  })

  it('local arena games keep their local definition', () => {
    const local = GAME_CATALOG.find((g) => g.kind === 'local')!
    const g = hydrateCatalogGame({ id: local.id, name: local.name })
    expect(g.kind).toBe('local')
    expect(g.icon).toBe(local.icon)
  })
})

describe('providersFromAssignedGames', () => {
  it('groups provider games, keeps known providers first and skips local games', () => {
    const spribe = SPRIBE_CATALOG_GAMES.slice(0, 3)
    const other = hydrateCatalogGame({ id: 'z1', name: 'Zeta', provider: 'ZetaGames' })
    const local = GAME_CATALOG.find((g) => g.kind === 'local')!
    const out = providersFromAssignedGames([other, ...spribe, local])
    expect(out[0].key).toBe('spribe')
    expect(out[0].games).toHaveLength(3)
    expect(out.find((p) => p.key === 'zetagames')?.games).toHaveLength(1)
    expect(out.some((p) => p.games?.some((g) => g.id === local.id))).toBe(false)
  })
})

describe('choiceLabel', () => {
  it('maps codes to labels and passes unknown codes through', () => {
    expect(choiceLabel('HEADS')).toBe('Heads')
    expect(choiceLabel('HI')).toBe('High (4–6)')
    expect(choiceLabel('FOO')).toBe('FOO')
  })
})
