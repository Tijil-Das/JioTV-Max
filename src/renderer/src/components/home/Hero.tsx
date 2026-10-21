import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CalendarClock, ChevronRight, Info, Play } from 'lucide-react'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { hexToRgba, initials } from '@/lib/color'
import { highestQuality } from '@/lib/constants'
import { formatRange, formatTime, getNowNext } from '@/lib/time'
import { easePremium, springSoft, tween } from '@/lib/motion'
import { useNow } from '@/hooks/useNow'
import { useSettingsStore } from '@/store/useSettingsStore'
import { Button } from '@/components/ui/Button'
import { ChannelLogo } from '@/components/ui/ChannelLogo'
import { LiveBadge, QualityBadge } from '@/components/ui/LiveBadge'

interface HeroProps {
  channels: Channel[]
  epg: Record<string, Program[]>
}

const ROTATE_MS = 8000

/**
 * Five-item cinematic hero. Artwork is generated from each channel's brand
 * colour so the composition feels editorial without shipping photography.
 */
export function Hero({ channels, epg }: HeroProps): JSX.Element {
  const navigate = useNavigate()
  const now = useNow()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const reduceMotion = useSettingsStore((state) => state.reduceMotion)
  const still = Boolean(prefersReducedMotion) || reduceMotion

  const items = useMemo(
    () =>
      channels.map((channel) => {
        const programs = epg[channel.id] ?? []
        const { current, next } = getNowNext(programs, now)
        const upcoming = programs
          .filter((program) => Date.parse(program.start) > now.getTime())
          .slice(0, 3)
        return { channel, current, next, upcoming }
      }),
    [channels, epg, now]
  )

  useEffect(() => {
    if (still || paused || items.length <= 1) return
    const timer = setTimeout(() => setIndex((value) => (value + 1) % items.length), ROTATE_MS)
    return () => clearTimeout(timer)
  }, [index, items.length, paused, still])

  if (items.length === 0) return <div className="h-[540px]" />

  const active = items[index % items.length]
  const { channel, current, next, upcoming } = active
  const tint = channel.brandColor

  const go = (direction: -1 | 1) =>
    setIndex((value) => (value + direction + items.length) % items.length)

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured channels"
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') go(1)
        if (event.key === 'ArrowLeft') go(-1)
      }}
      className="group/hero relative h-[560px] w-full overflow-hidden outline-none"
    >
      {/* Backdrop — one crossfading layer per channel. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={channel.id}
          aria-hidden
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0.01 : 0.9, ease: easePremium }}
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(120% 110% at 78% 8%, ${hexToRgba(tint, 0.5)} 0%, transparent 55%),
              radial-gradient(90% 90% at 8% 110%, ${hexToRgba(tint, 0.24)} 0%, transparent 60%),
              linear-gradient(160deg, #101019 0%, #07070b 62%)
            `
          }}
        />
      </AnimatePresence>
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(80% 60% at 70% 30%, #000 0%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(80% 60% at 70% 30%, #000 0%, transparent 70%)'
        }}
      />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-56 bg-hero-fade" />
      <div aria-hidden className="absolute inset-y-0 left-0 w-[70%] bg-gradient-to-r from-bg-base/90 via-bg-base/40 to-transparent" />

      {/* Oversized monogram + beams */}
      <motion.span
        key={`mono-${channel.id}`}
        aria-hidden
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: still ? 0.01 : 1, ease: easePremium }}
        className="pointer-events-none absolute -right-6 top-1/2 hidden -translate-y-1/2 font-display text-[340px] font-extrabold leading-none tracking-tighter text-white/[0.045] lg:block"
      >
        {initials(channel.name)}
      </motion.span>
      <span
        aria-hidden
        className="pointer-events-none absolute right-[16%] top-0 h-[130%] w-[2px] rotate-[18deg] bg-gradient-to-b from-transparent via-white/20 to-transparent"
      />

      <div className="relative z-10 mx-auto flex h-full max-w-[1600px] items-center gap-10 px-8 pb-16 pt-[92px]">
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={channel.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: still ? 0.01 : 0.5, ease: easePremium }}
              className="max-w-[680px]"
            >
              <div className="flex flex-wrap items-center gap-3">
                <LiveBadge size="md" />
                <ChannelLogo channel={channel} size="sm" glow />
                <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/75">
                  {channel.name}
                </span>
                <QualityBadge quality={highestQuality(channel)} />
              </div>

              <h2 className="mt-5 font-display text-[40px] font-bold leading-[1.04] tracking-tight text-white xl:text-[48px]">
                {current?.title ?? channel.name}
              </h2>
              <p className="mt-2 flex items-center gap-2 text-[13px] font-medium text-white/65">
                <CalendarClock className="h-3.5 w-3.5" />
                {current ? formatRange(current.start, current.end) : 'Live now'}
                <span className="text-white/30">•</span>
                {channel.language}
                <span className="text-white/30">•</span>
                Channel {channel.number}
              </p>
              <p className="mt-4 line-clamp-3 max-w-[600px] text-[14px] leading-relaxed text-text-secondary">
                {current?.description ?? channel.description}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  icon={<Play className="h-4 w-4 fill-current" />}
                  onClick={() => navigate(`/watch/${channel.id}`)}
                >
                  Watch live
                </Button>
                <Button
                  variant="glass"
                  size="lg"
                  icon={<Info className="h-4 w-4" />}
                  onClick={() => navigate(`/guide?channel=${channel.id}`)}
                >
                  Open guide
                </Button>
                {channel.isPremium ? (
                  <span className="rounded-pill border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-[11px] font-medium text-amber-200">
                    Included with your JioTV plan
                  </span>
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Up-next glass card */}
        <AnimatePresence mode="wait">
          <motion.aside
            key={channel.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={springSoft}
            className="glass hidden w-[340px] shrink-0 rounded-panel p-5 xl:block"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                On now
              </span>
              <span className="text-[11px] font-medium text-accent-alt">{channel.name}</span>
            </div>
            <p className="mt-3 line-clamp-2 font-display text-[16px] font-semibold text-white">
              {current?.title ?? 'Live programming'}
            </p>
            <div className="mt-3 h-[3px] overflow-hidden rounded-pill bg-white/10">
              <span
                key={`${channel.id}-${current?.id ?? 'live'}-${still ? 'still' : 'run'}`}
                className={cn('block h-full rounded-pill bg-accent-gradient', !still && 'hero-progress')}
                style={{ width: still ? '100%' : undefined, transform: undefined }}
              />
            </div>

            <div className="mt-5 border-t border-white/[0.07] pt-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Up next
              </span>
              <ul className="mt-3 space-y-3">
                {(upcoming.length > 0 ? upcoming : next ? [next] : []).slice(0, 3).map((program) => (
                  <li key={program.id} className="flex items-start gap-3">
                    <span className="w-12 shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-white/60">
                      {formatTime(program.start)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-white/90">
                        {program.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-text-muted">
                        {program.genre}
                      </span>
                    </span>
                  </li>
                ))}
                {upcoming.length === 0 && !next ? (
                  <li className="text-[12px] text-text-muted">Schedule continues after this programme.</li>
                ) : null}
              </ul>
            </div>
          </motion.aside>
        </AnimatePresence>
      </div>

      {/* Rotation controls */}
      <div className="absolute bottom-8 left-8 z-20 flex items-center gap-4">
        <div className="flex items-center gap-2.5" role="tablist" aria-label="Choose featured channel">
          {items.map((item, itemIndex) => (
            <button
              key={item.channel.id}
              type="button"
              role="tab"
              aria-selected={itemIndex === index}
              aria-label={`Feature ${item.channel.name}`}
              onClick={() => setIndex(itemIndex)}
              className="group/dot relative h-1.5 overflow-hidden rounded-pill bg-white/15 transition-all duration-300"
              style={{ width: itemIndex === index ? 44 : 18 }}
            >
              {itemIndex === index ? (
                <span
                  key={`${item.channel.id}-${paused}`}
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-pill bg-accent-gradient',
                    still ? 'w-full' : 'hero-progress',
                    paused && !still && 'hero-progress-paused'
                  )}
                  style={{ width: paused || still ? '100%' : undefined }}
                />
              ) : (
                <span className="absolute inset-0 rounded-pill bg-white/0 transition-colors group-hover/dot:bg-white/40" />
              )}
            </button>
          ))}
        </div>
        <span className="text-[11px] tabular-nums text-white/45">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next featured channel"
          className="rounded-full border border-white/10 bg-white/[0.04] p-1.5 text-white/60 opacity-0 transition-all duration-200 hover:text-white group-hover/hero:opacity-100"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  )
}
