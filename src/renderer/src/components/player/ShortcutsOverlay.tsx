import { Keyboard } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

const rows: Array<[string, string]> = [
  ['Space', 'Play / pause'],
  ['↑ / ↓', 'Previous / next channel'],
  ['← / →', 'Volume down / up'],
  ['F', 'Toggle fullscreen'],
  ['M', 'Mute / unmute'],
  ['C', 'Channel drawer'],
  ['Q', 'Quality menu'],
  ['P', 'Picture-in-picture'],
  ['?', 'This shortcut sheet'],
  ['Esc', 'Close overlay / leave player']
]

/** Player keyboard reference, toggled with the ? key or the help button. */
export function ShortcutsOverlay({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): JSX.Element {
  return (
    <Modal open={open} onClose={onClose} labelledBy="shortcuts-title" className="w-[520px] p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-accent-alt">
          <Keyboard className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 id="shortcuts-title" className="font-display text-[16px] font-semibold text-white">
            Player shortcuts
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Everything here works without moving your hands off the keyboard.
          </p>
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(([keys, description]) => (
          <li
            key={keys}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5"
          >
            <span className="text-[12.5px] text-text-secondary">{description}</span>
            <kbd className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 font-sans text-[12px] text-text-primary">
              {keys}
            </kbd>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
