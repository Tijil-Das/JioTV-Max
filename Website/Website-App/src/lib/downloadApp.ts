/**
 * Direct binary download helper.
 * Triggers direct download without page redirects and displays the
 * 'Downloading JioTv Max <version>' toast.
 */

let cachedVersion = 'v1.1.0'
let cachedUrl =
  'https://github.com/Tijil-Das/JioTV-Max/releases/download/v1.0.0/JioTv-Max-1.0.0-setup.exe'
let cachedFilename = 'JioTv-Max-1.0.0-setup.exe'

// Resolve latest tag in background
if (typeof window !== 'undefined') {
  fetch('https://api.github.com/repos/Tijil-Das/JioTV-Max/releases/latest', {
    headers: { Accept: 'application/vnd.github.v3+json' }
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data && data.tag_name) {
        cachedVersion = data.tag_name
        const asset = (data.assets || []).find((a: any) =>
          (a.name || '').toLowerCase().endsWith('.exe')
        )
        if (asset && asset.browser_download_url) {
          cachedUrl = asset.browser_download_url
          cachedFilename = asset.name
        }
      }
    })
    .catch(() => {})
}

function showStandaloneDownloadToast(message: string): void {
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
    if (toast) {
      toast.style.opacity = '1'
      toast.style.transform = 'translateX(-50%) translateY(0)'
    }
  })

  setTimeout(() => {
    if (toast) {
      toast.style.opacity = '0'
      toast.style.transform = 'translateX(-50%) translateY(16px)'
    }
  }, 3500)
}

function triggerDirectAnchorDownload(url: string, filename: string): void {
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    try {
      document.body.removeChild(link)
    } catch {}
  }, 150)
}

export function downloadLatestApp(): void {
  // If embedded in the website, communicate with host to trigger native direct download & host toast
  if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'JIOTV_TRIGGER_DOWNLOAD' }, '*')
    return
  }

  // Standalone mode:
  showStandaloneDownloadToast(`Downloading JioTv Max ${cachedVersion}`)
  triggerDirectAnchorDownload(cachedUrl, cachedFilename)
}
