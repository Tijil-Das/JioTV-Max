import React, { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Tv,
  Cast,
  Loader2,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Check,
  Copy,
  X,
  ChevronDown,
  ChevronUp,
  Smartphone
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type { CastDevice, CastMediaInput, CastErrorCode } from '@shared/cast-types'
import { CAST_STRINGS } from './cast-strings'
import { useCastStore } from './useCastStore'

interface CastDialogProps {
  media: CastMediaInput | null
  onOpenFallback: () => void
}

export function CastDialog({ media, onOpenFallback }: CastDialogProps): JSX.Element | null {
  const dialogOpen = useCastStore((s) => s.dialogOpen)
  const setDialogOpen = useCastStore((s) => s.setDialogOpen)
  const devices = useCastStore((s) => s.devices)
  const isSearching = useCastStore((s) => s.isSearching)
  const connectingDeviceId = useCastStore((s) => s.connectingDeviceId)
  const activeState = useCastStore((s) => s.activeState)
  const lastError = useCastStore((s) => s.lastError)
  const helpOpen = useCastStore((s) => s.helpOpen)
  const setHelpOpen = useCastStore((s) => s.setHelpOpen)
  const startDiscovery = useCastStore((s) => s.startDiscovery)
  const startCast = useCastStore((s) => s.startCast)
  const stopCast = useCastStore((s) => s.stopCast)
  const cancelConnecting = useCastStore((s) => s.cancelConnecting)
  const fetchDiagnostics = useCastStore((s) => s.fetchDiagnostics)
  const clearError = useCastStore((s) => s.clearError)

  const [searchTimerDone, setSearchTimerDone] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showDetails, setShowDetails] = useState(false)
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // 3.5s initial search timer before showing empty state if no devices found
  useEffect(() => {
    if (!dialogOpen) {
      setSearchTimerDone(false)
      setShowDetails(false)
      return
    }
    setSearchTimerDone(false)
    const timer = setTimeout(() => {
      setSearchTimerDone(true)
    }, 3500)
    return () => clearTimeout(timer)
  }, [dialogOpen])

  const handleSearchAgain = useCallback(() => {
    setSearchTimerDone(false)
    void startDiscovery()
    setTimeout(() => {
      setSearchTimerDone(true)
    }, 3500)
  }, [startDiscovery])

  // Focus trap & keyboard navigation
  useEffect(() => {
    if (!dialogOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setDialogOpen(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (devices.length > 0 ? (prev + 1) % devices.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (devices.length > 0 ? (prev - 1 + devices.length) % devices.length : 0))
      } else if (e.key === 'Enter') {
        if (devices[selectedIndex] && media && !connectingDeviceId) {
          e.preventDefault()
          void handleSelectDevice(devices[selectedIndex])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialogOpen, devices, selectedIndex, media, connectingDeviceId])

  const handleSelectDevice = useCallback(
    async (device: CastDevice) => {
      if (!media) return
      clearError()
      await startCast(device.id, media)
    },
    [media, startCast, clearError]
  )

  const handleCopyDiagnostics = async () => {
    const diag = await fetchDiagnostics()
    if (!diag) return
    const formatted = JSON.stringify(diag, null, 2)
    try {
      await navigator.clipboard.writeText(formatted)
      setCopiedDiagnostics(true)
      setTimeout(() => setCopiedDiagnostics(false), 2500)
    } catch {
      // ignore
    }
  }

  if (!dialogOpen) return null

  const getDeviceIcon = (dev: CastDevice) => {
    if (dev.protocol === 'chromecast') {
      return <Cast className="w-5 h-5 text-zinc-300" />
    }
    return <Tv className="w-5 h-5 text-zinc-300" />
  }

  const getProtocolLabel = (dev: CastDevice) => {
    if (dev.protocol === 'chromecast') return 'Google Cast'
    if (dev.protocol === 'dlna') return 'DLNA / UPnP'
    if (dev.protocol === 'airplay') return 'AirPlay'
    return 'Mock TV'
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cast-dialog-title"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#121216]/95 p-6 text-white shadow-2xl backdrop-blur-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <Cast className="w-5 h-5 text-[#E11D2E]" />
              <h2 id="cast-dialog-title" className="text-lg font-semibold tracking-tight text-white">
                {CAST_STRINGS.dialogTitle}
              </h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300 border border-white/10">
                {CAST_STRINGS.betaBadge}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={CAST_STRINGS.closeButton}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Inline Error Notification */}
          {lastError ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/40 p-3.5 text-sm text-red-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-200">{lastError.userMessage}</p>
                  {lastError.details ? (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setShowDetails(!showDetails)}
                        className="inline-flex items-center gap-1 text-xs text-red-300/80 hover:text-red-200"
                      >
                        {showDetails ? CAST_STRINGS.hideDetails : CAST_STRINGS.showDetails}
                        {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {showDetails ? (
                        <pre className="mt-1.5 max-h-24 overflow-auto rounded bg-black/50 p-2 font-mono text-[11px] text-zinc-300">
                          {lastError.details}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCopyDiagnostics}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-white/5 px-2.5 py-1 text-xs font-medium text-red-200 hover:bg-white/10"
                >
                  {copiedDiagnostics ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedDiagnostics ? CAST_STRINGS.copiedDiagnostics : CAST_STRINGS.copyDiagnostics}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearError()
                    void startDiscovery()
                  }}
                  className="rounded-lg bg-red-600/80 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500"
                >
                  {CAST_STRINGS.retryButton}
                </button>
              </div>
            </div>
          ) : null}

          {/* Help checklist panel */}
          {helpOpen ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-300">
              <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
                <span className="font-semibold text-white flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-zinc-400" />
                  {CAST_STRINGS.helpTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Back
                </button>
              </div>
              <ul className="space-y-2 text-xs leading-relaxed text-zinc-300">
                {CAST_STRINGS.helpChecklist.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[#E11D2E] font-bold mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
                <button
                  type="button"
                  onClick={handleCopyDiagnostics}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                >
                  {copiedDiagnostics ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedDiagnostics ? CAST_STRINGS.copiedDiagnostics : CAST_STRINGS.copyDiagnostics}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {/* Active Cast Session Banner */}
              {activeState.device && (activeState.state === 'casting' || activeState.state === 'loading') ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        Casting to {activeState.device.name}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {activeState.media?.title || 'Live Broadcast'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void stopCast()
                      setDialogOpen(false)
                    }}
                    className="shrink-0 ml-2 rounded-lg border border-red-500/30 bg-red-500/20 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/30 active:scale-95"
                  >
                    Disconnect
                  </button>
                </div>
              ) : null}

              {/* No media notice */}
              {!media && activeState.state !== 'casting' && activeState.state !== 'loading' ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-400">
                  Select and play a channel in the app to cast it to your TV.
                </div>
              ) : null}

              {/* Searching live status indicator (subtle header indicator when devices already exist) */}
              {isSearching && devices.length > 0 ? (
                <div className="flex items-center gap-2 text-xs text-zinc-400 px-1 py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E11D2E]" />
                  <span>Scanning for more TVs…</span>
                </div>
              ) : null}

              {/* Device List */}
              {devices.length > 0 ? (
                <div
                  className="max-h-64 overflow-y-auto space-y-2 pr-1"
                  role="listbox"
                  aria-label="Available cast devices"
                >
                  {devices.map((dev, idx) => {
                    const isConnecting = connectingDeviceId === dev.id
                    const isSelected = selectedIndex === idx
                    const isCurrentlyCasting = activeState.device?.id === dev.id && activeState.state === 'casting'

                    return (
                      <div
                        key={dev.id}
                        role="option"
                        aria-selected={isSelected}
                        tabIndex={0}
                        onClick={() => {
                          if (!isConnecting) void handleSelectDevice(dev)
                        }}
                        className={cn(
                          'group relative flex items-center justify-between rounded-xl border p-3 text-left transition-all cursor-pointer',
                          isSelected
                            ? 'border-white/30 bg-white/[0.08]'
                            : 'border-white/5 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]',
                          isCurrentlyCasting && 'border-emerald-500/40 bg-emerald-950/20'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="rounded-lg bg-white/10 p-2 shrink-0">
                            {getDeviceIcon(dev)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-white truncate">{dev.name}</p>
                            <p className="text-xs text-zinc-400 truncate">
                              {dev.model ? `${dev.model} • ` : ''}
                              {getProtocolLabel(dev)}
                              <span className="text-zinc-500 font-mono text-[11px] ml-1.5">({dev.host})</span>
                            </p>
                          </div>
                        </div>

                        {/* Status/Connecting badge or button */}
                        {isConnecting ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-300 flex items-center gap-1.5">
                              <Loader2 className="w-3 h-3 animate-spin text-[#E11D2E]" />
                              Connecting…
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                void cancelConnecting()
                              }}
                              className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:text-white border border-white/10 bg-white/5"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : isCurrentlyCasting ? (
                          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30">
                            Casting
                          </span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : searchTimerDone ? (
                /* Empty state */
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center">
                  <Tv className="w-8 h-8 text-zinc-500 mx-auto mb-2 opacity-60" />
                  <p className="font-semibold text-sm text-zinc-200">{CAST_STRINGS.emptyTitle}</p>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-xs mx-auto">
                    {CAST_STRINGS.emptySubtitle}
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleSearchAgain}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15 active:scale-95 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {CAST_STRINGS.searchAgainButton}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHelpOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      {CAST_STRINGS.helpButton}
                    </button>
                  </div>
                </div>
              ) : (
                /* Searching skeleton placeholder */
                <div className="py-8 text-center space-y-3">
                  <Loader2 className="w-7 h-7 animate-spin text-[#E11D2E] mx-auto opacity-80" />
                  <p className="text-xs text-zinc-400">{CAST_STRINGS.searchingText}</p>
                </div>
              )}
            </div>
          )}

          {/* Bottom Fallback Option: Always visible */}
          <div className="mt-5 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                setDialogOpen(false)
                onOpenFallback()
              }}
              className="w-full flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition-all hover:border-white/15 hover:bg-white/[0.06] group"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-white/10 p-2 text-zinc-300 group-hover:text-white">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-sm text-zinc-200 group-hover:text-white">
                    {CAST_STRINGS.openOnAnotherDevice}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {CAST_STRINGS.openOnAnotherDeviceSubtitle}
                  </p>
                </div>
              </div>
              <span className="text-xs text-zinc-400 font-medium group-hover:text-white">Open →</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
