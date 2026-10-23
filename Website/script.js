/**
 * JioTv Max — Official Landing Page JavaScript
 * Clean, lightweight, direct-download.
 */

document.addEventListener('DOMContentLoaded', () => {
  const GITHUB_REPO = 'Tijil-Das/JioTV-Max'
  // Direct default fallback to the published release binary
  let latestExeDownloadUrl =
    'https://github.com/Tijil-Das/JioTV-Max/releases/download/v1.0.0/JioTv-Max-1.0.0-setup.exe'
  let latestExeFilename = 'JioTv-Max-1.0.0-setup.exe'
  let isResolvingRelease = false

  function detectOS() {
    const ua = navigator.userAgent || ''
    if (/Windows/i.test(ua)) return 'Windows'
    if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS'
    if (/Linux/i.test(ua)) return 'Linux'
    if (/Android/i.test(ua)) return 'Android'
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
    return 'Windows'
  }

  function triggerDirectDownload(url, filename) {
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename || 'JioTv-Max-1.0.0-setup.exe')
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  async function resolveLatestRelease() {
    if (isResolvingRelease) return latestExeDownloadUrl
    isResolvingRelease = true

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json' }
      })

      if (response.ok) {
        const releaseData = await response.json()
        if (Array.isArray(releaseData.assets)) {
          const exeAsset = releaseData.assets.find(
            (asset) =>
              typeof asset.name === 'string' &&
              asset.name.toLowerCase().endsWith('.exe') &&
              !asset.name.toLowerCase().includes('blockmap')
          )

          if (exeAsset && exeAsset.browser_download_url) {
            latestExeDownloadUrl = exeAsset.browser_download_url
            latestExeFilename = exeAsset.name

            // Update all download button hrefs and download attributes
            const downloadButtons = document.querySelectorAll('.download-trigger')
            downloadButtons.forEach((btn) => {
              btn.setAttribute('href', latestExeDownloadUrl)
              btn.setAttribute('download', latestExeFilename)
            })

            // Update version badges across the site
            if (releaseData.tag_name) {
              const pillBadge = document.querySelector('.hero-pill-badge')
              if (pillBadge) pillBadge.textContent = `${releaseData.tag_name} RELEASE`

              const noteSpans = document.querySelectorAll('.hero-badge-note span, .download-note')
              noteSpans.forEach((el) => {
                if (el.textContent.includes('v1.0.0')) {
                  el.textContent = el.textContent.replace(/v[0-9.]+/g, releaseData.tag_name)
                }
              })
            }
          }
        }
      }
    } catch (err) {
      console.warn('Using direct v1.0.0 release fallback:', err)
    } finally {
      isResolvingRelease = false
    }

    return latestExeDownloadUrl
  }

  // Pre-fetch latest release on load so click is instantaneous
  resolveLatestRelease()

  // Handle direct download clicks
  const downloadButtons = document.querySelectorAll('.download-trigger')
  downloadButtons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault()

      showToast('Downloading the latest version')

      // If resolving is in flight, await it quickly, then trigger direct download
      const targetUrl = latestExeDownloadUrl || (await resolveLatestRelease())
      triggerDirectDownload(targetUrl, latestExeFilename)
    })
  })

  // Clean in-page toast notification (no glowing effects)
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
})
