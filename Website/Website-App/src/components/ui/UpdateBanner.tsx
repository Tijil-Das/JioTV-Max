import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export function UpdateBanner(): JSX.Element | null {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    if (!window.updater) return

    // Query state on initial mount (in case update downloaded before renderer finished loading)
    window.updater
      .getState()
      .then((state) => {
        if (state?.readyVersion) {
          setVersion(state.readyVersion)
        }
      })
      .catch(() => {
        // Silent failure
      })

    // Subscribe to new download completions
    window.updater.onReady((newVersion) => {
      setVersion(newVersion)
    })
  }, [])

  if (!version) return null

  const displayVersion = version.startsWith('v') ? version.slice(1) : version

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="fixed bottom-6 right-6 z-[130] flex items-center gap-3.5 rounded-xl border border-white/10 bg-[#0A0A0B]/95 px-4 py-3 shadow-[0_12px_36px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-xl"
        role="status"
        aria-live="polite"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--red,#E11D2E)]/15 text-[var(--red,#E11D2E)]">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="text-[13px] font-medium text-white">
          Update v{displayVersion} is ready
        </div>
        <button
          type="button"
          onClick={() => {
            window.updater?.restart()
          }}
          className="rounded-lg border border-white/10 bg-[#E11D2E] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-all hover:bg-[#EC2738] active:bg-[#C81525] active:scale-95"
        >
          Restart
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
