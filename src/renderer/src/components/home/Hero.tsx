import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Play } from 'lucide-react'
import type { Channel, Program } from '@shared/types'
import { cn } from '@/lib/cn'
import { highestQuality } from '@/lib/constants'
import { formatRange, getNowNext } from '@/lib/time'
import { easePremium } from '@/lib/motion'
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
 * Full-bleed hero. Real channel logo on a soft surface-2 field.
 * Overlay: left→right black gradient + bottom scrim into #000.
 * Text bottom-left max-w-[560px].
 * Pagination: thin 2px line segments bottom-right, no counter text.
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
        return { channel, current, next }
      }),
    [channels, epg, now]
  )

  useEffect(() => {
    if (still || paused || items.length <= 1) return
    const timer = setTimeout(() => setIndex((v) => (v + 1) % items.length), ROTATE_MS)
    return () => clearTimeout(timer)
  }, [index, items.length, paused, still])

  if (items.length === 0) return <div className="h-[520px]" />

  const active = items[index % items.length]
  const { channel, current } = active
  const quality = highestQuality(channel)

  const go = (d: -1 | 1) => setIndex((v) => (v + d + items.length) % items.length)

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured channels"
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
      }}
      className="group/hero relative h-[520px] w-full overflow-hidden outline-none"
    >
      {/* Backdrop — soft neutral surface for each channel, crossfades */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={channel.id}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0.01 : 0.6, ease: easePremium }}
          className="absolute inset-0 bg-[#0A0A0B]"
        />
      </AnimatePresence>

      {/* Subtle radial lift centered on the channel logo area */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`lift-${channel.id}`}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0.01 : 0.8, ease: easePremium }}
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(60% 70% at 65% 50%, rgba(255,255,255,0.03) 0%, transparent 70%)'
          }}
        />
      </AnimatePresence>

      {/* Left → right black gradient scrim (0.92 → 0) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 40%, transparent 70%)'
        }}
      />
      {/* Bottom scrim into bg */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-48"
        style={{ background: 'linear-gradient(to top, #000000 0%, rgba(0,0,0,0.6) 40%, transparent 100%)' }}
      />

      {/* Right side: large channel logo centered on the dark field */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`logo-${channel.id}`}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0.01 : 0.6, ease: easePremium }}
          className="absolute right-0 top-0 flex h-full w-[48%] items-center justify-center"
        >
          <ChannelLogo channel={channel} size="hero" />
        </motion.div>
      </AnimatePresence>

      {/* Content — bottom-left, max-w-[560px] */}
      <div className="relative z-10 flex h-full flex-col justify-end pb-16 pl-12 pr-8 pt-[92px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={channel.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: still ? 0.01 : 0.28, ease: easePremium }}
            className="max-w-[560px]"
          >
            {/* Overline */}
            <div className="flex items-center gap-2.5">
              <LiveBadge size="sm" />
              <span className="text-[11px] font-[600] uppercase tracking-[0.12em] text-[#A1A1A6]">
                {channel.name}
              </span>
              <QualityBadge quality={quality} />
            </div>

            {/* Display title */}
            <h2 className="mt-4 text-[40px] font-[700] leading-[1.04] tracking-[-0.03em] text-[#F4F4F5] xl:text-[48px]">
              {current?.title ?? channel.name}
            </h2>

            {/* One meta line */}
            <p className="mt-2 text-[13px] font-[450] text-[#A1A1A6]">
              {current ? formatRange(current.start, current.end) : 'Live now'}
              {channel.language ? ` · ${channel.language}` : ''}
            </p>

            {/* Description — 2 lines max */}
            {(current?.description ?? channel.description) ? (
              <p className="mt-3 line-clamp-2 max-w-[480px] text-[14px] leading-relaxed text-[#A1A1A6]">
                {current?.description ?? channel.description}
              </p>
            ) : null}

            {/* CTA row */}
            <div className="mt-8 flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                icon={<Play className="h-4 w-4 fill-current" />}
                onClick={() => navigate(`/watch/${channel.id}`)}
              >
                Watch live
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate(`/guide?channel=${channel.id}`)}
              >
                Open guide
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Pagination — thin 2px line segments, bottom-right, no counter */}
      <div className="absolute bottom-8 right-12 z-20 flex items-center gap-2" role="tablist" aria-label="Choose featured channel">
        {items.map((item, i) => (
          <button
            key={item.channel.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Feature ${item.channel.name}`}
            onClick={() => setIndex(i)}
            className="group/seg relative h-[2px] overflow-hidden rounded-full bg-white/20 transition-all duration-300"
            style={{ width: i === index ? 24 : 24 }}
          >
            {i === index ? (
              <span
                key={`${item.channel.id}-${paused}`}
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full bg-[#E11D2E]',
                  still ? 'w-full' : 'hero-progress',
                  paused && !still && 'hero-progress-paused'
                )}
                style={{ width: paused || still ? '100%' : undefined }}
              />
            ) : (
              <span className="absolute inset-0 rounded-full bg-white/0 transition-colors group-hover/seg:bg-white/40" />
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
