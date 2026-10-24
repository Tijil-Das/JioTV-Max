import { useEffect, useRef, useState } from 'react'

/** Debounces a fast-changing value (search input). */
export function useDebounce<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export type HotkeyHandler = (event: KeyboardEvent) => void

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable ||
    target.getAttribute('role') === 'textbox'
  )
}

/**
 * Registers global keyboard shortcuts. Editable fields win unless the shortcut
 * is explicitly allowed (Escape), so typing an OTP/search query never triggers
 * playback actions.
 */
export function useHotkeys(
  handlers: Record<string, HotkeyHandler>,
  options: { enabled?: boolean; allowInInputs?: string[] } = {}
): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const enabled = options.enabled ?? true
  const allowInInputs = options.allowInInputs ?? ['Escape']

  useEffect(() => {
    if (!enabled) return
    const listener = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const editable = isEditableTarget(event.target)
      if (editable && !allowInInputs.includes(event.key)) return
      const handler = handlersRef.current[event.key]
      if (handler) handler(event)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [enabled, allowInInputs])
}
