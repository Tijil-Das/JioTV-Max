import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  CheckCircle2,
  X,
  Play,
  Pause,
  RefreshCw,
  FolderOpen
} from 'lucide-react'
import { useRecordingStore } from '@/store/useRecordingStore'
import { cn } from '@/lib/cn'
import type { NotificationRecord } from '@shared/recording-types'

export function NotificationBannerArea(): JSX.Element | null {
  const notifications = useRecordingStore((s) => s.notifications)
  const markActed = useRecordingStore((s) => s.markNotificationActed)
  const markRead = useRecordingStore((s) => s.markNotificationRead)
  const pauseAll = useRecordingStore((s) => s.pauseAll)
  const openRecordingCentre = useRecordingStore((s) => s.openRecordingCentre)
  const resolveConflict = useRecordingStore((s) => s.resolveConflict)
  const retryFinalize = useRecordingStore((s) => s.retryFinalize)

  // Filter actionable / unacted notifications for the banner
  const bannerNotifications = useMemo(() => {
    return notifications.filter((n) => !n.isActed && ['buffering_hint', 'conflict', 'needs_attention', 'partial', 'recovered'].includes(n.type))
  }, [notifications])

  const [currentIndex, setCurrentIndex] = useState(0)

  if (bannerNotifications.length === 0) return null

  // Ensure index in bounds
  const activeIndex = Math.min(currentIndex, bannerNotifications.length - 1)
  const item: NotificationRecord = bannerNotifications[activeIndex]

  const handleNext = () => {
    setCurrentIndex((i) => (i + 1) % bannerNotifications.length)
  }

  const handlePrev = () => {
    setCurrentIndex((i) => (i - 1 + bannerNotifications.length) % bannerNotifications.length)
  }

  const handleDismiss = async () => {
    await markActed(item.id)
    if (currentIndex >= bannerNotifications.length - 1) {
      setCurrentIndex(Math.max(0, bannerNotifications.length - 2))
    }
  }

  const handleAction = async () => {
    if (item.type === 'buffering_hint') {
      await pauseAll()
      await markActed(item.id)
    } else if (item.type === 'needs_attention' && item.recordingId) {
      await retryFinalize(item.recordingId)
      await markActed(item.id)
    } else if (item.type === 'conflict' && item.conflictId) {
      openRecordingCentre('scheduled')
      await markActed(item.id)
    } else {
      openRecordingCentre('completed')
      await markActed(item.id)
    }
  }

  return (
    <div className="relative z-30 w-full bg-[#18181B] border-b border-white/10 px-4 py-2.5 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        {/* Left: icon + message + carousel count */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
            {item.type === 'buffering_hint' ? (
              <AlertTriangle className="h-4 w-4" />
            ) : item.type === 'needs_attention' ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Info className="h-4 w-4" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{item.title}</span>
              {bannerNotifications.length > 1 ? (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60 font-mono">
                  {activeIndex + 1} of {bannerNotifications.length}
                </span>
              ) : null}
            </div>
            <p className="text-white/70 truncate text-[11px] mt-0.5">{item.message}</p>
          </div>
        </div>

        {/* Right: Actions + Nav */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {bannerNotifications.length > 1 ? (
            <div className="flex items-center gap-1 mr-2">
              <button
                type="button"
                onClick={handlePrev}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-white/60 hover:text-white"
                title="Previous notice"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-white/60 hover:text-white"
                title="Next notice"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {/* Action Button */}
          {item.type === 'buffering_hint' ? (
            <button
              type="button"
              onClick={handleAction}
              className="rounded-lg bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/30 transition-all"
            >
              Pause Recordings
            </button>
          ) : item.type === 'needs_attention' ? (
            <button
              type="button"
              onClick={handleAction}
              className="rounded-lg bg-blue-500/20 border border-blue-500/40 px-2.5 py-1 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/30 transition-all"
            >
              Retry Finalize
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAction}
              className="rounded-lg bg-white/10 border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-white/90 hover:bg-white/15 transition-all"
            >
              View Centre
            </button>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg p-1 text-white/40 hover:text-white hover:bg-white/10 transition-all"
            title="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
