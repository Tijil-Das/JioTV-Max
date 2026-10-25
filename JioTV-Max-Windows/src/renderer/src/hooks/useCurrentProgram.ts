import { useEffect, useMemo, useState } from 'react'
import type { Channel, Program } from '@shared/types'
import { getNowNext, getProgress } from '@/lib/time'
import { useNow } from './useNow'
import { useChannelStore } from '@/store/useChannelStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { highestQuality } from '@/lib/constants'

export interface UseCurrentProgramResult {
  current: Program | null
  next: Program | null
  progress: number
  programs: Program[]
  secondaryText: string
}

/**
 * Hook to resolve and auto-update the currently airing program for a channel.
 * Sets an exact reminder timer at program end time to automatically advance
 * to the next program and refresh EPG when the schedule is exhausted.
 */
export function useCurrentProgram(
  channel: Channel,
  explicitPrograms?: Program[]
): UseCurrentProgramResult {
  const storeEpg = useChannelStore((state) => state.epg[channel.id])
  const loadEpgForChannel = useChannelStore((state) => state.loadEpgForChannel)
  const mode = useSettingsStore((state) => state.mode)
  const globalNow = useNow()

  const [finishTick, setFinishTick] = useState(0)

  const programs = explicitPrograms ?? storeEpg ?? []

  // Lazily hydrate EPG if not present
  useEffect(() => {
    if (programs.length === 0) {
      void loadEpgForChannel(channel, mode)
    }
  }, [channel.id, programs.length, mode, loadEpgForChannel])

  // Derive current and next program
  const { current, next } = useMemo(() => {
    return getNowNext(programs, new Date())
  }, [programs, globalNow, finishTick])

  // Exact program-finish reminder timer
  useEffect(() => {
    if (!current?.end) return

    const endMs = Date.parse(current.end)
    if (Number.isNaN(endMs)) return

    const nowMs = Date.now()
    const msUntilEnd = endMs - nowMs + 500

    if (msUntilEnd <= 0) {
      setFinishTick((t) => t + 1)
      return
    }

    const delay = Math.min(msUntilEnd, 24 * 60 * 60 * 1000)

    const timer = setTimeout(() => {
      setFinishTick((t) => t + 1)
      if (!next || Date.parse(next.end) <= Date.now() + 60_000) {
        void loadEpgForChannel(channel, mode)
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [channel.id, current?.id, current?.end, next?.end, mode, loadEpgForChannel])

  const progress = current ? getProgress(current, globalNow) : 0
  const quality = highestQuality(channel)
  const secondaryText = [channel.language, quality].filter(Boolean).join(' · ')

  return {
    current,
    next,
    progress,
    programs,
    secondaryText
  }
}
