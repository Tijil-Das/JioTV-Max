import { useState } from 'react'
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Info,
  AlertTriangle,
  RefreshCw,
  Film
} from 'lucide-react'
import { useRecordingStore } from '@/store/useRecordingStore'
import { cn } from '@/lib/cn'

export function NotificationBell(): JSX.Element {
  const [open, setOpen] = useState(false)
  const notifications = useRecordingStore((s) => s.notifications)
  const unreadCount = useRecordingStore((s) => s.unreadNotificationsCount)
  const markRead = useRecordingStore((s) => s.markNotificationRead)
  const openRecordingCentre = useRecordingStore((s) => s.openRecordingCentre)

  const handleToggle = () => {
    setOpen((o) => !o)
  }

  const handleMarkAllRead = async () => {
    await markRead()
  }

  const handleNotificationClick = async (id: string) => {
    await markRead(id)
    openRecordingCentre('completed')
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          open ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
        )}
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {/* Slide-out popover drawer */}
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 rounded-2xl border border-white/10 bg-[#141417] p-4 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Notifications</h3>
                {unreadCount > 0 ? (
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                    {unreadCount} new
                  </span>
                ) : null}
              </div>

              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white transition-colors"
                >
                  <CheckCheck className="h-3 w-3" />
                  <span>Mark all read</span>
                </button>
              ) : null}
            </div>

            {/* List */}
            <div className="mt-3 max-h-80 overflow-y-auto space-y-2 pr-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-white/40">
                  <p>No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    onClick={() => void handleNotificationClick(n.id)}
                    className={cn(
                      'cursor-pointer rounded-xl p-2.5 transition-all flex items-start gap-3 border',
                      n.isRead
                        ? 'border-transparent bg-white/[0.02] hover:bg-white/[0.05]'
                        : 'border-white/10 bg-white/[0.06] hover:bg-white/[0.09]'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5',
                        n.type === 'buffering_hint' || n.type === 'partial'
                          ? 'bg-amber-500/20 text-amber-300'
                          : n.type === 'finished'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-white/10 text-white/70'
                      )}
                    >
                      {n.type === 'buffering_hint' ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : n.type === 'finished' ? (
                        <Film className="h-3.5 w-3.5" />
                      ) : (
                        <Info className="h-3.5 w-3.5" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className={cn('text-xs font-semibold truncate', n.isRead ? 'text-white/80' : 'text-white')}>
                          {n.title}
                        </p>
                        <span className="text-[10px] text-white/40 whitespace-nowrap ml-2">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/60 line-clamp-2 mt-0.5 leading-relaxed">{n.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-white/10 text-center">
              <button
                type="button"
                onClick={() => {
                  openRecordingCentre('recording')
                  setOpen(false)
                }}
                className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
              >
                Open Recording Centre
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
