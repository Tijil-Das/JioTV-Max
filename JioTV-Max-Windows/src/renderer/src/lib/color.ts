/** Small colour helpers used for per-channel artwork and tints. */

export function hexToRgba(hex: string, alpha = 1): string {
  const value = hex.replace('#', '')
  const normalised =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value
  const parsed = Number.parseInt(normalised, 16)
  if (Number.isNaN(parsed)) return `rgba(124, 92, 255, ${alpha})`
  const r = (parsed >> 16) & 255
  const g = (parsed >> 8) & 255
  const b = parsed & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function initials(name: string): string {
  const cleaned = name
    .replace(/\b(HD|SD|4K|Plus|\+)\b/gi, ' ')
    .replace(/&/g, ' ')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
  if (!cleaned) return name.slice(0, 2).toUpperCase()
  const words = cleaned.split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}
