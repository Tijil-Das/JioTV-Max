import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tv, Copy, Check, X, Loader2 } from 'lucide-react'
import type { CastMediaInput } from '@shared/cast-types'
import { CAST_STRINGS } from './cast-strings'
import { useCastStore } from './useCastStore'

interface CastFallbackModalProps {
  media: CastMediaInput | null
}

export function CastFallbackModal({ media }: CastFallbackModalProps): JSX.Element | null {
  const fallbackModalOpen = useCastStore((s) => s.fallbackModalOpen)
  const setFallbackModalOpen = useCastStore((s) => s.setFallbackModalOpen)
  const generateFallbackInfo = useCastStore((s) => s.generateFallbackInfo)
  const fallbackInfo = useCastStore((s) => s.fallbackInfo)

  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (fallbackModalOpen && media) {
      setLoading(true)
      generateFallbackInfo(media).finally(() => setLoading(false))
    }
  }, [fallbackModalOpen, media, generateFallbackInfo])

  if (!fallbackModalOpen) return null

  const handleCopy = async () => {
    if (!fallbackInfo?.url) return
    try {
      await navigator.clipboard.writeText(fallbackInfo.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#121216] p-6 text-white shadow-2xl backdrop-blur-xl text-center"
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
            <div className="flex items-center gap-2">
              <Tv className="w-5 h-5 text-[#E11D2E]" />
              <h3 className="font-semibold text-sm">{CAST_STRINGS.fallbackModalTitle}</h3>
            </div>
            <button
              type="button"
              onClick={() => setFallbackModalOpen(false)}
              className="rounded-lg p-1 text-zinc-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed mb-4">
            {CAST_STRINGS.fallbackModalSubtitle}
          </p>

          {/* QR Code Container */}
          <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-xl bg-white p-3 shadow-inner">
            {loading ? (
              <Loader2 className="w-8 h-8 animate-spin text-zinc-700" />
            ) : fallbackInfo?.qrDataUrl ? (
              <img
                src={fallbackInfo.qrDataUrl}
                alt="Stream QR Code"
                className="h-full w-full object-contain"
              />
            ) : (
              <p className="text-xs text-zinc-500">Failed to generate QR code</p>
            )}
          </div>

          {/* URL & Copy Link */}
          {fallbackInfo?.url ? (
            <div className="mt-4 space-y-2">
              <div className="rounded-lg bg-black/40 border border-white/5 p-2 font-mono text-xs text-zinc-300 break-all select-all">
                {fallbackInfo.url}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-white/15 active:scale-95"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? CAST_STRINGS.fallbackCopied : CAST_STRINGS.fallbackCopyLink}
              </button>
            </div>
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
