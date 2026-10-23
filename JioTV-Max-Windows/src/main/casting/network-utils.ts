import { networkInterfaces } from 'node:os'
import { castLogger } from './logger'

const VIRTUAL_INTERFACE_REGEX = /virtual|vmware|vbox|veth|wsl|hyper-v|tailscale|zerotier|docker|tap|tun|loopback|npcap/i

/**
 * Converts an IPv4 string to a 32-bit integer.
 */
function ipToInt(ip: string): number {
  return (
    ip
      .split('.')
      .map(Number)
      .reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0
  )
}

/**
 * Checks if two IPv4 addresses belong to the same subnet given a netmask.
 */
function areInSameSubnet(ip1: string, ip2: string, netmask: string): boolean {
  try {
    const mask = ipToInt(netmask)
    return (ipToInt(ip1) & mask) === (ipToInt(ip2) & mask)
  } catch {
    return false
  }
}

/**
 * Discovers candidate active LAN IPv4 addresses on this machine,
 * prioritizing physical adapters (Wi-Fi, Ethernet) over virtual/VPN adapters.
 */
export function getLanIpAddress(targetDeviceIp?: string): string {
  const interfaces = networkInterfaces()
  const candidates: Array<{ name: string; address: string; netmask: string; priority: number }> = []

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    const isVirtual = VIRTUAL_INTERFACE_REGEX.test(name)

    for (const addr of addrs) {
      // Must be IPv4, non-internal
      const isIpv4 = addr.family === 'IPv4' || (addr as unknown as { family: number }).family === 4
      if (!isIpv4 || addr.internal) continue
      if (addr.address === '127.0.0.1' || addr.address === '0.0.0.0') continue

      // Base priority
      let priority = 10
      if (isVirtual) {
        priority -= 20
      }

      // Wi-Fi or Ethernet naming bonus
      if (/wi-fi|wifi|wlan|ethernet|eth|en/i.test(name)) {
        priority += 15
      }

      // Check standard private LAN ranges
      if (addr.address.startsWith('192.168.')) {
        priority += 10
      } else if (addr.address.startsWith('10.')) {
        priority += 8
      } else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(addr.address)) {
        priority += 6
      }

      candidates.push({
        name,
        address: addr.address,
        netmask: addr.netmask,
        priority
      })
    }
  }

  // 1. If targetDeviceIp is provided, prioritize interface on the exact same subnet
  if (targetDeviceIp) {
    const subnetMatch = candidates.find((c) =>
      areInSameSubnet(c.address, targetDeviceIp, c.netmask)
    )
    if (subnetMatch) {
      castLogger.info(`Matched LAN IP ${subnetMatch.address} on interface ${subnetMatch.name} to target ${targetDeviceIp}`)
      return subnetMatch.address
    }
  }

  // 2. Otherwise sort by priority descending
  candidates.sort((a, b) => b.priority - a.priority)

  if (candidates.length > 0) {
    castLogger.info(`Selected LAN IP ${candidates[0].address} (${candidates[0].name})`)
    return candidates[0].address
  }

  // Fallback if no network interface found
  castLogger.warn('No physical or private LAN IP found, falling back to 127.0.0.1')
  return '127.0.0.1'
}
