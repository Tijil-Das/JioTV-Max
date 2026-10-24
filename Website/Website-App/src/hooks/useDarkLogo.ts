import { useEffect, useState } from 'react'
import { isImageDark } from '@/lib/imageLuminance'

/**
 * Hook to dynamically detect if a channel logo is dark/black so a contrasting
 * background can be applied automatically in the dark UI.
 */
export function useDarkLogo(imageUrl?: string | null, threshold = 50): boolean {
  const [isDarkLogo, setIsDarkLogo] = useState(false)

  useEffect(() => {
    if (!imageUrl) {
      setIsDarkLogo(false)
      return
    }

    let active = true
    void isImageDark(imageUrl, threshold).then((dark) => {
      if (active) setIsDarkLogo(dark)
    })

    return () => {
      active = false
    }
  }, [imageUrl, threshold])

  return isDarkLogo
}
