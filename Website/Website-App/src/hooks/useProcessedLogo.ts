import { useEffect, useState } from 'react'
import type { Channel } from '@shared/types'
import { getProcessedLogo, type ProcessedLogo } from '@/lib/logo/logoService'

/**
 * Resolves a channel logo through the worker pipeline. `priority` should
 * become `visible` when the tile enters the viewport so above-the-fold logos
 * are processed first.
 */
export function useProcessedLogo(
  channel?: Pick<Channel, 'id' | 'logoUrl'> | null,
  priority: 'visible' | 'idle' = 'idle'
): { logo: ProcessedLogo | null; loading: boolean } {
  const [logo, setLogo] = useState<ProcessedLogo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!channel) {
      setLogo(null)
      setLoading(false)
      return
    }
    let alive = true
    void getProcessedLogo(channel, priority).then((result) => {
      if (!alive) return
      setLogo(result)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [channel?.id, channel?.logoUrl, priority])

  return { logo, loading }
}
