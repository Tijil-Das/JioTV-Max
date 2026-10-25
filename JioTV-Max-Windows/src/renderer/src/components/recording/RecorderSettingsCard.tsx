import { Radio, FolderOpen, ExternalLink, Sliders } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useRecordingStore } from '@/store/useRecordingStore'

export function RecorderSettingsCard(): JSX.Element {
  const openRecordingCentre = useRecordingStore((s) => s.openRecordingCentre)
  const preferences = useRecordingStore((s) => s.preferences)
  const recordings = useRecordingStore((s) => s.recordings)

  const activeCount = recordings.filter((r) => ['starting', 'recording', 'paused', 'reconnecting'].includes(r.status)).length
  const completedCount = recordings.filter((r) => r.status === 'completed').length

  return (
    <div className="rounded-[14px] border border-[rgba(255,255,255,0.08)] bg-[#141417] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-red-500/25 bg-red-500/10 text-red-500">
            <Radio className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <p className="text-[15px] font-[650] text-[#F4F4F5]">Channel Recorder</p>
              {activeCount > 0 ? (
                <span className="rounded-full border border-red-500/25 bg-red-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-red-400 animate-pulse">
                  {activeCount} recording{activeCount > 1 ? 's' : ''} active
                </span>
              ) : (
                <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-[#71717A]">
                  {completedCount} saved
                </span>
              )}
            </div>
            {/* Permanent notice mandated by spec */}
            <p className="mt-1 text-[13px] leading-relaxed text-[#A1A1A6]">
              Recordings only run while this app is open. If you see buffering while watching, try pausing or turning off recordings, because they use network bandwidth in the background.
            </p>
            {preferences?.defaultFolder ? (
              <p className="mt-1 font-mono text-[11px] text-white/40 truncate">
                Folder: {preferences.defaultFolder}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Sliders className="h-3.5 w-3.5" />}
            onClick={() => openRecordingCentre('preferences')}
          >
            Preferences
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => openRecordingCentre('recording')}
            className="bg-red-600 hover:bg-red-500 text-white"
          >
            Open Recording Centre
          </Button>
        </div>
      </div>
    </div>
  )
}
