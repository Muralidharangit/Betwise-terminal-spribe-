import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchGames, fetchProviders, type GameCatalogItem } from '../api/client'
import {
  hydrateCatalogGame,
  lobbyProviderFromApi,
  type GameDefinition,
  type LobbyProvider,
} from '../games/catalog'

const PAGE_SIZE = 50
const MAX_GAMES_LIMIT = 200

function mapAssigned(items: GameCatalogItem[], isAllGames = false) {
  return items
    .filter((game) => {
      if (game.name?.toLowerCase().includes('mobile')) return false
      if (isAllGames) return true // All Games may include kind: "local", provider dummyGame
      return game.kind !== 'local' // Specific provider tab filters out non-provider local games
    })
    .map((game) => hydrateCatalogGame(game))
}

export function useShopProviders() {
  const [providers, setProviders] = useState<LobbyProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gamesByProvider, setGamesByProvider] = useState<Record<string, GameDefinition[]>>({})
  const [providerPage, setProviderPage] = useState<Record<string, { page: number; lastPage: number }>>({})
  const [gamesLoading, setGamesLoading] = useState(false)
  const [gamesLoadingMore, setGamesLoadingMore] = useState(false)
  const [gamesError, setGamesError] = useState<string | null>(null)
  const [allGames, setAllGames] = useState<GameDefinition[]>([])
  const [allPage, setAllPage] = useState(0)
  const [allLastPage, setAllLastPage] = useState(1)
  const [allLoading, setAllLoading] = useState(false)
  const [allLoadingMore, setAllLoadingMore] = useState(false)
  const [allError, setAllError] = useState<string | null>(null)
  const allInflight = useRef(false)
  const providerInflight = useRef(false)

  useEffect(() => {
    let cancelled = false

    // Fetch shop providers up to max 100
    fetchProviders(1, 100)
      .then((items) => {
        if (cancelled) return
        setProviders(items.map(lobbyProviderFromApi))
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setProviders([])
        setError(err instanceof Error ? err.message : 'Unable to load providers')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const loadProviderGames = useCallback(async (providerName: string, page = 1) => {
    if (providerInflight.current) return
    providerInflight.current = true
    if (page === 1) {
      setGamesLoading(true)
    } else {
      setGamesLoadingMore(true)
    }
    setGamesError(null)
    try {
      const result = await fetchGames({ provider: providerName, page, limit: PAGE_SIZE })
      const mapped = mapAssigned(result.items, false)
      setGamesByProvider((current) => {
        const prev = current[providerName] ?? []
        const combined = page === 1 ? mapped : [...prev, ...mapped]
        return {
          ...current,
          [providerName]: combined.slice(0, MAX_GAMES_LIMIT),
        }
      })
      setProviderPage((current) => ({
        ...current,
        [providerName]: {
          page: result.pagination.current_page,
          lastPage: result.pagination.last_page,
        },
      }))
    } catch (err) {
      setGamesError(err instanceof Error ? err.message : 'Unable to load games')
    } finally {
      providerInflight.current = false
      setGamesLoading(false)
      setGamesLoadingMore(false)
    }
  }, [])

  const loadMoreProviderGames = useCallback(
    (providerName: string) => {
      const meta = providerPage[providerName]
      const currentList = gamesByProvider[providerName] ?? []
      if (
        !meta ||
        gamesLoading ||
        gamesLoadingMore ||
        meta.page >= meta.lastPage ||
        currentList.length >= MAX_GAMES_LIMIT
      )
        return
      void loadProviderGames(providerName, meta.page + 1)
    },
    [gamesByProvider, gamesLoading, gamesLoadingMore, loadProviderGames, providerPage],
  )

  const loadAllGames = useCallback(async (page = 1) => {
    if (allInflight.current) return
    allInflight.current = true
    if (page === 1) {
      setAllLoading(true)
    } else {
      setAllLoadingMore(true)
    }
    setAllError(null)
    try {
      const result = await fetchGames({ page, limit: PAGE_SIZE })
      const mapped = mapAssigned(result.items, true)
      setAllGames((current) => {
        const combined = page === 1 ? mapped : [...current, ...mapped]
        return combined.slice(0, MAX_GAMES_LIMIT)
      })
      setAllPage(result.pagination.current_page)
      setAllLastPage(result.pagination.last_page)
    } catch (err) {
      setAllError(err instanceof Error ? err.message : 'Unable to load games')
    } finally {
      allInflight.current = false
      setAllLoading(false)
      setAllLoadingMore(false)
    }
  }, [])

  const loadMoreAllGames = useCallback(() => {
    if (
      allLoading ||
      allLoadingMore ||
      allPage === 0 ||
      allPage >= allLastPage ||
      allGames.length >= MAX_GAMES_LIMIT
    )
      return
    void loadAllGames(allPage + 1)
  }, [allGames.length, allLastPage, allLoading, allLoadingMore, allPage, loadAllGames])

  return {
    providers,
    loading,
    error,
    gamesByProvider,
    gamesLoading,
    gamesLoadingMore,
    gamesError,
    loadProviderGames,
    loadMoreProviderGames,
    providerHasMore: (providerName: string) => {
      const meta = providerPage[providerName]
      const count = (gamesByProvider[providerName] ?? []).length
      return !!meta && meta.page < meta.lastPage && count < MAX_GAMES_LIMIT
    },
    allGames,
    allPage,
    allLoading,
    allLoadingMore,
    allError,
    allHasMore: allPage > 0 && allPage < allLastPage && allGames.length < MAX_GAMES_LIMIT,
    loadAllGames,
    loadMoreAllGames,
  }
}
