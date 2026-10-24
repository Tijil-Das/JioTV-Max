import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Horizontal carousel mechanics: edge-aware chevrons, scroll-by-page, and
 * Shift+wheel support. The visual mask is applied by the consumer.
 */
export function useRowScroll<T extends HTMLElement = HTMLDivElement>(): {
  ref: React.RefObject<T>
  canScrollLeft: boolean
  canScrollRight: boolean
  scrollByPage: (direction: -1 | 1) => void
  onWheel: (event: React.WheelEvent<T>) => void
  update: () => void
} {
  const ref = useRef<T>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const update = useCallback(() => {
    const element = ref.current
    if (!element) return
    const maxScroll = element.scrollWidth - element.clientWidth
    setCanScrollLeft(element.scrollLeft > 4)
    setCanScrollRight(element.scrollLeft < maxScroll - 4)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    const onScroll = () => update()
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', onScroll)
    }
  }, [update])

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const element = ref.current
    if (!element) return
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'smooth' })
  }, [])

  const onWheel = useCallback((event: React.WheelEvent<T>) => {
    if (!event.shiftKey || !ref.current) return
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault()
      ref.current.scrollLeft += event.deltaY
    }
  }, [])

  return { ref, canScrollLeft, canScrollRight, scrollByPage, onWheel, update }
}
