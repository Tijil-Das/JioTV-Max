/**
 * JioTv Max — Official Landing Page JavaScript
 * Clean, lightweight, OS-aware GitHub release resolver.
 */

document.addEventListener('DOMContentLoaded', () => {
  const GITHUB_REPO = 'Tijil-Das/JioTV-Max'
  
  // Default fallback target (Windows 64-bit release)
  let latestDownloadUrl =
    'https://github.com/Tijil-Das/JioTV-Max/releases/download/v1.0.0/JioTv-Max-1.0.0-setup.exe'
  let latestFilename = 'JioTv-Max-1.0.0-setup.exe'
  let latestVersion = 'v1.0.0'
  let isResolvingRelease = false

  function detectOS() {
    const ua = navigator.userAgent || ''
    const platform = navigator.platform || ''
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'Windows'
    if (/Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua)) return 'macOS'
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'Linux'
    if (/Android/i.test(ua)) return 'Android'
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
    return 'Windows'
  }

  const userOS = detectOS()

  function findAssetForOS(assets, os) {
    if (!Array.isArray(assets) || assets.length === 0) return null

    // Exclude blockmaps and checksum files
    const cleanAssets = assets.filter((asset) => {
      const name = (asset.name || '').toLowerCase()
      return !name.includes('blockmap') && !name.endsWith('.yml') && !name.endsWith('.sha512') && !name.endsWith('.txt')
    })

    if (os === 'Windows') {
      return cleanAssets.find((a) => {
        const name = a.name.toLowerCase()
        return name.endsWith('.exe') || name.endsWith('.msi')
      })
    }

    if (os === 'macOS') {
      return (
        cleanAssets.find((a) => {
          const name = a.name.toLowerCase()
          return name.endsWith('.dmg') || name.endsWith('.pkg')
        }) ||
        cleanAssets.find((a) => {
          const name = a.name.toLowerCase()
          return name.endsWith('.zip') && (name.includes('mac') || name.includes('darwin'))
        })
      )
    }

    if (os === 'Linux') {
      return cleanAssets.find((a) => {
        const name = a.name.toLowerCase()
        return name.endsWith('.appimage') || name.endsWith('.deb') || name.endsWith('.rpm') || (name.endsWith('.tar.gz') && name.includes('linux'))
      })
    }

    return null
  }

  function triggerDirectDownload(url, filename) {
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename || 'JioTv-Max-setup.exe')
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function applyReleaseData(version, downloadUrl, filename, targetOS, hasDirectAsset) {
    latestVersion = version || latestVersion
    latestDownloadUrl = downloadUrl || latestDownloadUrl
    latestFilename = filename || latestFilename

    // 1. Update all download trigger links
    const downloadButtons = document.querySelectorAll('.download-trigger')
    downloadButtons.forEach((btn) => {
      btn.setAttribute('href', latestDownloadUrl)
      btn.setAttribute('download', latestFilename)
    })

    // 2. Update version pill in hero
    const pillBadge = document.querySelector('.hero-pill-badge')
    if (pillBadge) {
      pillBadge.textContent = `${latestVersion} RELEASE`
    }

    // 3. Update all version text spans
    const versionSpans = document.querySelectorAll('.app-version-tag')
    versionSpans.forEach((el) => {
      el.textContent = latestVersion
    })

    // 4. Update button text according to detected OS & availability
    const buttonTexts = document.querySelectorAll('.btn-download-text')
    buttonTexts.forEach((el) => {
      if (hasDirectAsset && targetOS !== 'Windows') {
        el.textContent = `Download for ${targetOS}`
      } else {
        el.textContent = 'Download for Windows'
      }
    })

    // 5. Update nav button text
    const navBtnText = document.querySelector('.nav-btn-text')
    if (navBtnText) {
      navBtnText.textContent = 'Download'
    }

    // 6. Update OS notes if a non-Windows direct asset was resolved
    if (hasDirectAsset && targetOS !== 'Windows') {
      const osSpans = document.querySelectorAll('.app-os-tag')
      osSpans.forEach((el) => {
        el.textContent = `${targetOS} (64-bit)`
      })
    }
  }

  async function resolveLatestRelease() {
    if (isResolvingRelease) return latestDownloadUrl
    isResolvingRelease = true

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json' }
      })

      if (response.ok) {
        const releaseData = await response.json()
        const version = releaseData.tag_name || 'v1.0.0'
        const assets = releaseData.assets || []

        // Attempt to find asset for user's detected OS
        const osAsset = findAssetForOS(assets, userOS)
        // Fallback to Windows executable
        const windowsAsset = findAssetForOS(assets, 'Windows')

        const selectedAsset = osAsset || windowsAsset
        const hasDirectAsset = Boolean(osAsset)

        if (selectedAsset && selectedAsset.browser_download_url) {
          applyReleaseData(
            version,
            selectedAsset.browser_download_url,
            selectedAsset.name,
            userOS,
            hasDirectAsset
          )
        } else {
          // If no binary asset found, update version numbers with existing fallback
          applyReleaseData(version, latestDownloadUrl, latestFilename, userOS, false)
        }
      }
    } catch (err) {
      console.warn('Could not query GitHub releases API, using default fallback:', err)
    } finally {
      isResolvingRelease = false
    }

    return latestDownloadUrl
  }

  // Pre-fetch latest release on load so click is instantaneous
  resolveLatestRelease()

  // Handle direct download clicks
  const downloadButtons = document.querySelectorAll('.download-trigger')
  downloadButtons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault()

      showToast(`Downloading JioTv Max ${latestVersion}`)

      // If resolving is in flight, await it quickly, then trigger direct download
      const targetUrl = latestDownloadUrl || (await resolveLatestRelease())
      triggerDirectDownload(targetUrl, latestFilename)
    })
  })

  // Clean in-page toast notification
  function showToast(message) {
    let toast = document.getElementById('site-toast')
    if (!toast) {
      toast = document.createElement('div')
      toast.id = 'site-toast'
      toast.style.position = 'fixed'
      toast.style.bottom = '28px'
      toast.style.left = '50%'
      toast.style.transform = 'translateX(-50%) translateY(16px)'
      toast.style.background = '#18181D'
      toast.style.color = '#F4F4F6'
      toast.style.border = '1px solid rgba(255, 255, 255, 0.16)'
      toast.style.padding = '10px 20px'
      toast.style.borderRadius = '8px'
      toast.style.fontSize = '13.5px'
      toast.style.fontWeight = '500'
      toast.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.6)'
      toast.style.opacity = '0'
      toast.style.transition = 'all 0.2s ease'
      toast.style.zIndex = '9999'
      toast.style.pointerEvents = 'none'
      document.body.appendChild(toast)
    }

    toast.textContent = message
    requestAnimationFrame(() => {
      toast.style.opacity = '1'
      toast.style.transform = 'translateX(-50%) translateY(0)'
    })

    setTimeout(() => {
      toast.style.opacity = '0'
      toast.style.transform = 'translateX(-50%) translateY(16px)'
    }, 3500)
  }

  // ─── Central Master Server Clock ────────────────────────────────────────
  const SESSION_START_KEY = '__jiotv_server_session_start__'
  function getMasterSessionStart() {
    let start = null
    try {
      const stored = sessionStorage.getItem(SESSION_START_KEY)
      if (stored) {
        const parsed = Number(stored)
        if (!isNaN(parsed) && parsed > 0) start = parsed
      }
    } catch {}
    if (!start) {
      start = Date.now()
      try {
        sessionStorage.setItem(SESSION_START_KEY, String(start))
      } catch {}
    }
    window.__JIOTV_SERVER_START__ = start
    return start
  }
  const sessionStartTime = getMasterSessionStart()

  function getServerTime(duration = 1606.94) {
    const elapsed = Math.max(0, (Date.now() - sessionStartTime) / 1000)
    return elapsed % duration
  }

  // ─── Production App Showcase Tabs & Routing ─────────────────────────────
  const showcaseTabs = document.querySelectorAll('.showcase-tab')
  const appFrame = document.getElementById('app-embed-frame')
  const appView = document.getElementById('showcase-app-view')
  const miniView = document.getElementById('showcase-miniplayer-view')
  const miniVideo = document.getElementById('miniplayer-floating-video')
  const showcaseCaption = document.getElementById('showcase-caption')

  const tabCaptions = {
    'tab-app': '<strong>Production Windows Client:</strong> Experience the actual JioTv Max desktop application live in your browser — complete with real-time EPG, seamless channel switching, and synchronized HLS streaming.',
    'tab-miniplayer': '<strong>Picture-in-Picture Miniplayer:</strong> Distraction-free, draggable always-on-top window over your real desktop workflow. Grab and drag anywhere over the workspace.',
    'tab-player': '<strong>1080p Live Streamer:</strong> Full-bleed GPU-accelerated video stage with live rolling DVR timeshift timeline and multi-track audio.',
    'tab-catalogue': '<strong>Channel Catalogue:</strong> 1,000+ national and regional channels organized by category shelves, language filters, and resolution tiers.'
  }

  let currentTabIndex = 0
  let ignoreHostSyncUntil = 0

  function activateTab(index, updateRoute = true) {
    if (!showcaseTabs.length || index < 0 || index >= showcaseTabs.length) return
    const tab = showcaseTabs[index]
    const route = tab.getAttribute('data-route') || '#/'
    const tabId = tab.id

    showcaseTabs.forEach((t) => {
      t.classList.remove('active')
      t.setAttribute('aria-selected', 'false')
    })
    tab.classList.add('active')
    tab.setAttribute('aria-selected', 'true')

    if (updateRoute) {
      ignoreHostSyncUntil = Date.now() + 800
    }

    if (tabId === 'tab-miniplayer') {
      if (appView) appView.style.display = 'none'
      if (miniView) miniView.style.display = 'flex'
      const miniFrame = document.getElementById('miniplayer-embed-frame')
      if (miniFrame) {
        const miniRoute = tab.getAttribute('data-route') || '#/watch/ch-specimen-1?mini=true'
        miniFrame.src = 'app/index.html' + miniRoute
      }
    } else {
      if (miniView) miniView.style.display = 'none'
      const miniFrame = document.getElementById('miniplayer-embed-frame')
      if (miniFrame) {
        miniFrame.src = 'about:blank'
      }
      if (appView) {
        appView.style.display = 'block'
        if (tabId === 'tab-player') {
          appView.classList.add('is-player')
        } else {
          appView.classList.remove('is-player')
        }
      }

      // Direct SPA message navigation — never re-assign appFrame.src on tab clicks to avoid iframe reload
      if (appFrame && appFrame.contentWindow) {
        try {
          appFrame.contentWindow.postMessage({
            type: 'JIOTV_NAVIGATE',
            tabId,
            route
          }, '*')
        } catch {}
      }
    }

    if (showcaseCaption && tabCaptions[tabId]) {
      showcaseCaption.innerHTML = tabCaptions[tabId]
    }
  }

  showcaseTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      currentTabIndex = index
      activateTab(index, true)
    })
  })

  // Listen for navigation, aspect ratio, and scroll messages from embedded app iframe
  window.addEventListener('message', (event) => {
    if (!event.data) return

    // 1. Synchronize Tab Highlights from app navigation
    if (event.data.type === 'JIOTV_ACTIVE_ROUTE') {
      if (Date.now() < ignoreHostSyncUntil) return
      const tabId = event.data.tab
      // Ignore background miniplayer notifications if miniView is hidden
      if (tabId === 'tab-miniplayer' && miniView && miniView.style.display === 'none') {
        return
      }
      const targetTab = document.getElementById(tabId)
      if (targetTab) {
        showcaseTabs.forEach((t) => {
          t.classList.remove('active')
          t.setAttribute('aria-selected', 'false')
        })
        targetTab.classList.add('active')
        targetTab.setAttribute('aria-selected', 'true')

        if (tabId === 'tab-player') {
          if (appView) appView.classList.add('is-player')
        } else {
          if (appView) appView.classList.remove('is-player')
        }

        if (showcaseCaption && tabCaptions[tabId]) {
          showcaseCaption.innerHTML = tabCaptions[tabId]
        }
      }
    }

    // 2. Switch tab requested by app (e.g. miniplayer toggle)
    if (event.data.type === 'JIOTV_SWITCH_TAB') {
      const tabId = event.data.tab
      const targetTab = document.getElementById(tabId)
      if (targetTab) {
        if (event.data.channelId && tabId === 'tab-miniplayer') {
          targetTab.setAttribute('data-route', `#/watch/${event.data.channelId}?mini=true`)
        } else if (event.data.channelId && tabId === 'tab-player') {
          targetTab.setAttribute('data-route', `#/watch/${event.data.channelId}`)
        }
        targetTab.click()
      }
    }

    // 2b. Draggable miniplayer movement forwarded from miniplayer iframe
    if (event.data.type === 'JIOTV_MINIPLAYER_DRAG_START') {
      isFloatingDragging = true
      initFloatingMiniPos()
    } else if (event.data.type === 'JIOTV_MINIPLAYER_MOVE' && miniPlayerEl && desktopFrame) {
      if (floatingMiniX === null || floatingMiniY === null) {
        initFloatingMiniPos()
      }
      const rawDx = typeof event.data.dx === 'number' ? event.data.dx : 0
      const rawDy = typeof event.data.dy === 'number' ? event.data.dy : 0
      const dpr = event.data.dpr || window.devicePixelRatio || 1
      const dx = rawDx / dpr
      const dy = rawDy / dpr

      const frameRect = desktopFrame.getBoundingClientRect()
      const miniRect = miniPlayerEl.getBoundingClientRect()
      const maxLeft = Math.max(0, frameRect.width - miniRect.width)
      const maxTop = Math.max(0, frameRect.height - miniRect.height - 46)

      floatingMiniX = Math.max(0, Math.min(floatingMiniX + dx, maxLeft))
      floatingMiniY = Math.max(0, Math.min(floatingMiniY + dy, maxTop))

      miniPlayerEl.style.transition = 'none'
      miniPlayerEl.style.left = `${Math.round(floatingMiniX)}px`
      miniPlayerEl.style.top = `${Math.round(floatingMiniY)}px`
      miniPlayerEl.style.right = 'auto'
      miniPlayerEl.style.bottom = 'auto'
    } else if (event.data.type === 'JIOTV_MINIPLAYER_DRAG_END') {
      isFloatingDragging = false
    }

    // 3. Dynamic Player Aspect Ratio according to video dimensions
    if (event.data.type === 'JIOTV_PLAYER_ASPECT') {
      const aspect =
        event.data.aspect ||
        (event.data.width && event.data.height
          ? `${event.data.width} / ${event.data.height}`
          : '16 / 9')
      if (appView) {
        appView.style.setProperty('--player-aspect', aspect)
        if (appView.classList.contains('is-player')) {
          appView.style.aspectRatio = aspect
        }
      }
    }

    // 4. Scroll chaining from web app to website
    if (event.data.type === 'JIOTV_PARENT_SCROLL' && typeof event.data.deltaY === 'number') {
      window.scrollBy({
        top: event.data.deltaY,
        behavior: 'auto'
      })
    }

    // 5. Direct download trigger from web-app iframe
    if (event.data.type === 'JIOTV_TRIGGER_DOWNLOAD') {
      showToast(`Downloading JioTv Max ${latestVersion}`)
      void (async () => {
        const targetUrl = latestDownloadUrl || (await resolveLatestRelease())
        triggerDirectDownload(targetUrl, latestFilename)
      })()
    }
  })

  // ─── Draggable Miniplayer over VS Code Window ──────────────────────────
  const miniPlayerEl = document.getElementById('floating-miniplayer')
  const desktopFrame = document.getElementById('showcase-miniplayer-view')
  let floatingMiniX = null
  let floatingMiniY = null
  let isFloatingDragging = false

  function initFloatingMiniPos() {
    if (!miniPlayerEl || !desktopFrame) return
    const frameRect = desktopFrame.getBoundingClientRect()
    const miniRect = miniPlayerEl.getBoundingClientRect()
    floatingMiniX = miniRect.left - frameRect.left
    floatingMiniY = miniRect.top - frameRect.top
  }

  // ─── Interactive Simulated VS Code Editor ─────────────────────────────────
  const vsCodeTabs = document.querySelectorAll('.vscode-tab')
  const vsCodeTitle = document.getElementById('vscode-title-text')
  const vsCodeBreadcrumbs = document.getElementById('vscode-breadcrumbs')
  const vsCodeInput = document.getElementById('vscode-input')
  const vsCodeHighlight = document.getElementById('vscode-highlight')
  const vsCodeGutter = document.getElementById('vscode-gutter')
  const vsCodeLnCol = document.getElementById('vscode-ln-col')
  const vsCodeLangMode = document.getElementById('vscode-lang-mode')

  const vsCodeFiles = {
    'media-relay.ts': {
      path: 'src/main/media-relay.ts',
      breadcrumbs: [
        '<span>src</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span>main</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span class="bc-active">media-relay.ts</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span class="bc-fn">MediaRelay</span>'
      ].join(' '),
      lang: 'ts',
      mode: 'TypeScript',
      code: `import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { PLAYER_UA, withHdneaCookie } from './jio-headers'

/**
 * Loopback media relay for JioTV desktop playback.
 * Routes authenticated manifests, segments, and Widevine license
 * endpoints through an ephemeral loopback interface at 127.0.0.1.
 */
export interface RelaySession {
  id: string
  channelId: string
  manifestUrl: string
  licenseUrl?: string
  headers: Record<string, string>
  quality: 'auto' | 'high' | 'medium' | 'low'
  generation: number
}

export class MediaRelay {
  private server: Server | null = null
  private sessions = new Map<string, RelaySession>()

  async start(): Promise<number> {
    this.server = createServer((req, res) => this.handleRequest(req, res))
    return new Promise((resolve) => {
      this.server!.listen(0, '127.0.0.1', () => {
        resolve((this.server!.address() as any).port)
      })
    })
  }

  registerSession(session: Omit<RelaySession, 'id' | 'generation'>): string {
    const id = randomUUID()
    this.sessions.set(id, { ...session, id, generation: 1 })
    return id
  }
}`
    },
    'SnapController.ts': {
      path: 'src/main/snap-overlay/SnapController.ts',
      breadcrumbs: [
        '<span>src</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span>main</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span>snap-overlay</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span class="bc-active">SnapController.ts</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span class="bc-fn">SnapController</span>'
      ].join(' '),
      lang: 'ts',
      mode: 'TypeScript',
      code: `import { BrowserWindow, ipcMain } from 'electron'
import type { SnapBounds, SnapButtonState } from '@shared/types'
import { isWindows11OrNewerBuild } from './geometry'
import { loadSnapAddon, type SnapOverlayAddon } from './addonLoader'

/**
 * Windows 11 Native Snap Layout Overlay Controller.
 * Embeds a child HWND over the maximize button to intercept WM_NCHITTEST
 * and render Microsoft Windows 11 snap layouts natively.
 */
export class SnapController {
  private static controllers = new Map<number, SnapController>()
  private readonly win: BrowserWindow
  private readonly addon: SnapOverlayAddon | null = null
  private childHwnd: bigint | null = null
  private isMiniPlayer = false

  constructor(win: BrowserWindow) {
    this.win = win
    if (!isWindows11OrNewerBuild()) return
    this.addon = loadSnapAddon()
  }

  public setMiniPlayerMode(isMini: boolean): void {
    this.isMiniPlayer = isMini
    if (isMini && this.childHwnd && this.addon) {
      this.addon.updateRect(this.childHwnd, -1000, -1000, 0, 0)
    }
  }
}`
    },
    'stream-probe.ts': {
      path: 'src/main/stream-probe.ts',
      breadcrumbs: [
        '<span>src</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span>main</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span class="bc-active">stream-probe.ts</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span class="bc-fn">probeStream</span>'
      ].join(' '),
      lang: 'ts',
      mode: 'TypeScript',
      code: `import { net } from 'electron'
import type { StreamProbeStage1 } from '@shared/types'
import { isMasterPlaylist, isMediaPlaylist } from './probe-utils'

/**
 * Stage-1 stream verification.
 * Fetches HLS (#EXTM3U) or DASH (<MPD) manifests, follows master playlists
 * to variant media playlists, verifies DRM flags, and probes the first segment.
 */
export async function probeStream(url: string, signal: AbortSignal): Promise<StreamProbeStage1> {
  const response = await net.fetch(url, {
    signal,
    headers: {
      Accept: 'application/x-mpegURL,application/dash+xml,*/*',
      'User-Agent': 'JioTV-Max-Desktop/2.4.0 (Windows NT 10.0; Win64; x64)'
    }
  })

  if (!response.ok) {
    return { ok: false, reason: \`HTTP \${response.status} returned by CDN.\` }
  }

  const manifest = await response.text()
  const isHls = manifest.trimStart().startsWith('#EXTM3U')

  return {
    ok: true,
    format: isHls ? 'hls' : 'dash',
    hasDrm: manifest.includes('KEYFORMAT="com.widevine"'),
    variantsCount: manifest.split('#EXT-X-STREAM-INF').length - 1
  }
}`
    },
    'jio-service.ts': {
      path: 'src/main/jio-service.ts',
      breadcrumbs: [
        '<span>src</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span>main</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span class="bc-active">jio-service.ts</span>',
        '<span class="bc-sep">&rsaquo;</span>',
        '<span class="bc-fn">JioService</span>'
      ].join(' '),
      lang: 'ts',
      mode: 'TypeScript',
      code: `import { app } from 'electron'
import type { AuthSession, Channel, StreamInfo } from '@shared/types'
import { API_UA, buildPlaybackHeaders } from './jio-headers'

const API = {
  loginSendOtp: 'https://jiotvapi.media.jio.com/userservice/apis/v1/loginotp/send',
  loginVerifyOtp: 'https://jiotvapi.media.jio.com/userservice/apis/v1/loginotp/verify',
  channelsAuthed: 'https://jiotv.data.cdn.jio.com/apis/v3.1/getMobileChannelList/get',
  playback: 'https://jiotvapi.media.jio.com/playback/apis/v1.1/geturl?langId=6'
}

/** Authenticated JioTV API client with OTP flow and playback ticket signing */
export class JioService {
  private session: AuthSession | null = null

  async sendOtp(mobileNumber: string): Promise<boolean> {
    const res = await fetch(API.loginSendOtp, {
      method: 'POST',
      headers: { 'User-Agent': API_UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: mobileNumber })
    })
    return res.ok
  }

  async getPlaybackUrl(channelId: string): Promise<string> {
    const headers = buildPlaybackHeaders(this.session?.ssoToken)
    const res = await fetch(\`\${API.playback}&channelId=\${channelId}\`, { headers })
    const data = await res.json()
    return data.result
  }
}`
    }
  }

  let activeFileName = 'media-relay.ts'

  function highlightCode(code, lang) {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    if (lang === 'json') {
      return escaped.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function (match) {
          let cls = 'syn-num'
          if (/^"/.test(match)) {
            cls = /:$/.test(match) ? 'syn-prop' : 'syn-str'
          } else if (/true|false/.test(match)) {
            cls = 'syn-kw'
          }
          return '<span class="' + cls + '">' + match + '</span>'
        }
      )
    }

    const tokens = []
    let text = escaped

    text = text.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, (m) => {
      tokens.push('<span class="syn-cm">' + m + '</span>')
      return `__TOKEN_${tokens.length - 1}__`
    })

    text = text.replace(/("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/g, (m) => {
      tokens.push('<span class="syn-str">' + m + '</span>')
      return `__TOKEN_${tokens.length - 1}__`
    })

    text = text.replace(
      /\b(import|export|from|class|interface|async|await|function|return|const|let|var|type|new|if|else|throw|try|catch|private|public|protected|readonly)\b/g,
      '<span class="syn-kw">$1</span>'
    )

    text = text.replace(
      /\b(string|number|boolean|any|void|null|undefined|Record|Promise|Server|Map|RelaySession|BrowserWindow|Channel|StreamInfo|App|Error)\b/g,
      '<span class="syn-type">$1</span>'
    )

    text = text.replace(/\b(\d+)\b/g, '<span class="syn-num">$1</span>')

    text = text.replace(/__TOKEN_(\d+)__/g, (_, idx) => tokens[Number(idx)])

    return text
  }

  function renderEditor() {
    if (!vsCodeInput || !vsCodeHighlight || !vsCodeGutter) return
    const file = vsCodeFiles[activeFileName]
    if (!file) return

    const code = vsCodeInput.value
    file.code = code

    const lines = code.split('\n')
    vsCodeGutter.innerHTML = lines.map((_, i) => `<span>${i + 1}</span>`).join('')
    vsCodeHighlight.innerHTML = highlightCode(code, file.lang) + '\n'
  }

  function switchVsCodeFile(fileName) {
    if (!vsCodeFiles[fileName]) return
    if (vsCodeInput) {
      vsCodeFiles[activeFileName].code = vsCodeInput.value
    }
    activeFileName = fileName
    const file = vsCodeFiles[fileName]

    vsCodeTabs.forEach((tab) => {
      if (tab.getAttribute('data-file') === fileName) {
        tab.classList.add('active')
      } else {
        tab.classList.remove('active')
      }
    })

    if (vsCodeTitle) {
      vsCodeTitle.textContent = `${fileName} — JioTV-Max-Windows — Visual Studio Code`
    }
    if (vsCodeBreadcrumbs) {
      vsCodeBreadcrumbs.innerHTML = file.breadcrumbs
    }
    if (vsCodeLangMode) {
      vsCodeLangMode.textContent = file.mode
    }
    if (vsCodeInput) {
      vsCodeInput.value = file.code
      renderEditor()
      updateCursorPosition()
    }
  }

  function updateCursorPosition() {
    if (!vsCodeInput || !vsCodeLnCol) return
    const textBefore = vsCodeInput.value.substring(0, vsCodeInput.selectionStart)
    const lines = textBefore.split('\n')
    const ln = lines.length
    const col = lines[lines.length - 1].length + 1
    vsCodeLnCol.textContent = `Ln ${ln}, Col ${col}`
  }

  if (vsCodeInput) {
    vsCodeInput.value = vsCodeFiles[activeFileName].code
    renderEditor()

    vsCodeInput.addEventListener('input', () => {
      renderEditor()
      updateCursorPosition()
    })

    vsCodeInput.addEventListener('scroll', () => {
      if (vsCodeHighlight) {
        vsCodeHighlight.scrollTop = vsCodeInput.scrollTop
        vsCodeHighlight.scrollLeft = vsCodeInput.scrollLeft
      }
      if (vsCodeGutter) {
        vsCodeGutter.scrollTop = vsCodeInput.scrollTop
      }
    })

    vsCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const start = vsCodeInput.selectionStart
        const end = vsCodeInput.selectionEnd
        const val = vsCodeInput.value
        vsCodeInput.value = val.substring(0, start) + '  ' + val.substring(end)
        vsCodeInput.selectionStart = vsCodeInput.selectionEnd = start + 2
        renderEditor()
        updateCursorPosition()
      }
    })

    ;['keyup', 'click', 'focus', 'select'].forEach((evt) => {
      vsCodeInput.addEventListener(evt, updateCursorPosition)
    })
  }

  vsCodeTabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation()
      const fileName = tab.getAttribute('data-file')
      if (fileName) {
        switchVsCodeFile(fileName)
      }
    })
  })

  // ─── "Show Why?" Technical Deep Dive Modal ──────────────────────────────
  const whyModal = document.getElementById('why-modal')
  const whyCloseBtn = document.getElementById('why-modal-close')
  const whyTriggers = document.querySelectorAll('#show-why-btn, .btn-show-why-inline')

  function openWhyModal() {
    if (!whyModal) return
    whyModal.classList.add('active')
    whyModal.setAttribute('aria-hidden', 'false')
    document.body.classList.add('modal-open')
    if (whyCloseBtn) whyCloseBtn.focus()
  }

  function closeWhyModal() {
    if (!whyModal) return
    whyModal.classList.remove('active')
    whyModal.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('modal-open')
  }

  whyTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault()
      openWhyModal()
    })
  })

  if (whyCloseBtn) {
    whyCloseBtn.addEventListener('click', (e) => {
      e.preventDefault()
      closeWhyModal()
    })
  }

  if (whyModal) {
    whyModal.addEventListener('click', (e) => {
      if (e.target === whyModal) {
        closeWhyModal()
      }
    })
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && whyModal && whyModal.classList.contains('active')) {
      closeWhyModal()
    }
  })
})

