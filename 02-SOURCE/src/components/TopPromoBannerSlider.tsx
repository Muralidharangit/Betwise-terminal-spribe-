import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getGameById, type GameDefinition } from '../games/catalog'

interface PromoBannerItem {
  id: string
  image: string
  title: string
  alt: string
  targetGameId?: string
}

/** Featured Play Now promos — 8 premium game banners. */
const PROMO_BANNERS: PromoBannerItem[] = [
  {
    id: 'promo-aviator',
    image: '/assets/banner/promo-aviator.jpg?v=promo34',
    title: 'Fly High & Win Big! Cash out before it flies away.',
    alt: 'Aviator Fly High Win Big Promo',
    targetGameId: 'aviator',
  },
  {
    id: 'promo-pilot',
    image: '/assets/banner/promo-pilot.jpg?v=promo34',
    title: 'Chicken Pilot Takes Off! Soar high — cash out smarter.',
    alt: 'Pilot Chicken Promo',
    targetGameId: 'pilot',
  },
  {
    id: 'promo-mines',
    image: '/assets/banner/promo-mines.jpg?v=promo34',
    title: 'Gems or Boom? Your Call! One wrong tile. Huge rewards.',
    alt: 'Mines Gems or Boom Promo',
    targetGameId: 'mines',
  },
  {
    id: 'promo-balloon',
    image: '/assets/banner/promo-balloon.jpg?v=promo34',
    title: 'Pump Higher. Cash Faster! Cash out before it pops.',
    alt: 'Balloon Pump Higher Promo',
    targetGameId: 'balloon',
  },
  {
    id: 'promo-plinko',
    image: '/assets/banner/promo-plinko.jpg?v=promo34',
    title: 'Bounce Into Fortune! Every bounce could be big.',
    alt: 'Plinko Bounce Into Fortune Promo',
    targetGameId: 'plinko',
  },
  {
    id: 'promo-dice',
    image: '/assets/banner/promo-dice.jpg?v=promo34',
    title: 'High or Low? Decide Now! One roll. Instant thrill.',
    alt: 'Dice High or Low Promo',
    targetGameId: 'dice',
  },
  {
    id: 'promo-goal',
    image: '/assets/banner/promo-goal.jpg?v=promo34',
    title: 'Kick Through & Cash Out! Safe tiles. Bigger multipliers.',
    alt: 'Goal Kick Through Promo',
    targetGameId: 'goal',
  },
  {
    id: 'promo-hotline',
    image: '/assets/banner/promo-hotline.jpg?v=promo34',
    title: 'Red or Black? Catch the Flame! x2 classic — x32 fire.',
    alt: 'Hotline Catch the Flame Promo',
    targetGameId: 'hotline',
  },
]

// First three banners appended for seamless forward looping (up to 3 visible on wide screens)
const DISPLAY_BANNERS = [...PROMO_BANNERS, ...PROMO_BANNERS.slice(0, 3)]

interface TopPromoBannerSliderProps {
  disabled?: boolean
  catalogGames: GameDefinition[]
  onSelect: (game: GameDefinition) => void
}

export function TopPromoBannerSlider({
  catalogGames,
  onSelect,
}: TopPromoBannerSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(true)
  const touchStartXRef = useRef<number | null>(null)
  const touchEndXRef = useRef<number | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickRef = useRef(false)

  const bannerCount = PROMO_BANNERS.length

  const handleNext = useCallback(() => {
    setIsTransitioning(true)
    setCurrentIndex((prev) => prev + 1)
  }, [])

  const handlePrev = useCallback(() => {
    if (currentIndex === 0) {
      // Jump instantly to cloned position, then slide back by 1
      setIsTransitioning(false)
      setCurrentIndex(bannerCount)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsTransitioning(true)
          setCurrentIndex(bannerCount - 1)
        })
      })
    } else {
      setIsTransitioning(true)
      setCurrentIndex((prev) => prev - 1)
    }
  }, [currentIndex, bannerCount])

  // Seamless loop reset when sliding past the last banner
  useEffect(() => {
    if (currentIndex >= bannerCount) {
      // After the slide animation (650ms) finishes, silently snap back to index 0
      resetTimerRef.current = setTimeout(() => {
        setIsTransitioning(false)
        setCurrentIndex(0)
      }, 650)
      return () => {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      }
    }
  }, [currentIndex, bannerCount])

  // Re-enable transition once index resets to 0
  useEffect(() => {
    if (!isTransitioning && currentIndex === 0) {
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsTransitioning(true)
        })
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [isTransitioning, currentIndex])

  // Keep auto-moving even when balance is 0 / mouse rests on the banners (kiosk).
  // Pause while the window is hidden so a background tab does not keep painting.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        handleNext()
      }, 4000)
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = undefined
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [handleNext])

  const resolveBannerGame = useCallback(
    (banner: PromoBannerItem): GameDefinition | null => {
      const qId = banner.targetGameId?.toLowerCase()
      if (!qId) return null

      const fromCatalog = catalogGames.find(
        (g) =>
          g.id.toLowerCase() === qId ||
          g.name.toLowerCase().includes(qId) ||
          (qId === 'miniroulette' &&
            (g.id.toLowerCase().includes('roulette') || g.name.toLowerCase().includes('wheel'))) ||
          (qId === 'keno' &&
            (g.id.toLowerCase().includes('keno') || g.name.toLowerCase().includes('kino'))) ||
          (qId === 'keno80' &&
            (g.id.toLowerCase().includes('keno') || g.name.toLowerCase().includes('keno'))),
      )
      if (fromCatalog) return fromCatalog

      const fromLocal = getGameById(qId)
      if (fromLocal) return fromLocal

      // Always return a playable stub so zero-balance still opens the credits popup
      return {
        id: qId,
        name: banner.title.split('!')[0]?.trim() || qId,
        category: 'Crash & Instant',
        description: banner.title,
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
        image: banner.image,
      }
    },
    [catalogGames],
  )

  const handleBannerClick = (banner: PromoBannerItem, fromTouch = false) => {
    if (!fromTouch && suppressClickRef.current) return
    const game = resolveBannerGame(banner)
    if (game) {
      onSelect(game)
    }
  }

  // Touch swipe support for kiosks and touchscreens
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.targetTouches[0].clientX
    touchEndXRef.current = e.targetTouches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current == null) return
    const endX = touchEndXRef.current ?? touchStartXRef.current
    const distance = touchStartXRef.current - endX
    const minSwipeDistance = 50
    if (distance > minSwipeDistance) {
      handleNext()
    } else if (distance < -minSwipeDistance) {
      handlePrev()
    } else {
      // Tap (not swipe) — some WebViews suppress the follow-up click
      const slide = (e.target as HTMLElement | null)?.closest?.('[data-banner-index]')
      const rawIndex = slide?.getAttribute('data-banner-index')
      const index = rawIndex != null ? Number(rawIndex) : NaN
      if (Number.isFinite(index) && DISPLAY_BANNERS[index]) {
        suppressClickRef.current = true
        handleBannerClick(DISPLAY_BANNERS[index], true)
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 400)
      }
    }
    touchStartXRef.current = null
    touchEndXRef.current = null
  }

  const activeDot = currentIndex % bannerCount

  return (
    <div
      className="top-promo-banner-section"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="top-promo-swiper-container">
        <div
          className="top-promo-swiper-track"
          style={{
            transform: `translate3d(calc(-${currentIndex} * var(--promo-slide-shift, calc(50% + 6px))), 0, 0)`,
            transition: isTransitioning
              ? 'transform 0.65s cubic-bezier(0.2, 0.9, 0.3, 1)'
              : 'none',
          }}
        >
          {DISPLAY_BANNERS.map((banner, index) => (
            <div
              key={`${banner.id}-${index}`}
              data-banner-index={index}
              className={`top-promo-slide ${index === currentIndex || index === currentIndex + 1 ? 'is-active' : ''}`}
              onClick={() => handleBannerClick(banner)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleBannerClick(banner)
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Launch ${banner.title}`}
            >
              <img
                src={banner.image}
                alt={banner.alt}
                className="top-promo-banner-img"
                loading={index < 2 ? 'eager' : 'lazy'}
                decoding="async"
              />
              <div className="top-promo-banner-sheen" />
              <div className="top-promo-cta-sweep" aria-hidden="true" />
            </div>
          ))}
        </div>

        {/* Previous Button */}
        <button
          type="button"
          className="btn-promo-nav btn-promo-prev"
          onClick={(e) => {
            e.stopPropagation()
            handlePrev()
          }}
          aria-label="Previous Banner"
        >
          <i className="fa-solid fa-chevron-left" />
        </button>

        {/* Next Button */}
        <button
          type="button"
          className="btn-promo-nav btn-promo-next"
          onClick={(e) => {
            e.stopPropagation()
            handleNext()
          }}
          aria-label="Next Banner"
        >
          <i className="fa-solid fa-chevron-right" />
        </button>

        {/* Dot Indicators */}
        <div className="top-promo-dots">
          {PROMO_BANNERS.map((banner, idx) => (
            <button
              key={`dot-${banner.id}`}
              type="button"
              className={`top-promo-dot ${idx === activeDot ? 'is-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setIsTransitioning(true)
                setCurrentIndex(idx)
              }}
              aria-label={`Go to banner ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
