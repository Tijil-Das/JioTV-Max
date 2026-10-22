/**
 * JioTv Max — Official Landing Page JavaScript
 * Clean, lightweight, dependency-free.
 */

document.addEventListener('DOMContentLoaded', () => {
  // GitHub Latest Release Windows Binary (.exe) Auto-Resolver & Downloader
  const GITHUB_REPO = 'Tijil-Das/JioTV-Max'
  const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`
  let latestExeDownloadUrl = null
  let isResolvingRelease = false

  async function resolveLatestRelease() {
    if (latestExeDownloadUrl) return latestExeDownloadUrl
    if (isResolvingRelease) return null
    isResolvingRelease = true

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json' }
      })

      if (!response.ok) {
        throw new Error(`GitHub API returned HTTP ${response.status}`)
      }

      const releaseData = await response.json()

      if (Array.isArray(releaseData.assets)) {
        // Look for the Windows installer setup .exe
        const exeAsset = releaseData.assets.find(
          (asset) =>
            typeof asset.name === 'string' &&
            asset.name.toLowerCase().endsWith('.exe') &&
            !asset.name.toLowerCase().includes('blockmap')
        )

        if (exeAsset && exeAsset.browser_download_url) {
          latestExeDownloadUrl = exeAsset.browser_download_url

          // Update all download buttons with direct binary download link and filename
          const downloadButtons = document.querySelectorAll('.download-trigger')
          downloadButtons.forEach((btn) => {
            btn.setAttribute('href', latestExeDownloadUrl)
            btn.setAttribute('download', exeAsset.name)
          })

          // Dynamically update version badges across the site
          if (releaseData.tag_name) {
            const pillBadge = document.querySelector('.hero-pill-badge')
            if (pillBadge) pillBadge.textContent = `${releaseData.tag_name} RELEASE`

            const noteSpans = document.querySelectorAll('.hero-badge-note span, .download-note')
            noteSpans.forEach((el) => {
              if (el.textContent.includes('v1.0.0')) {
                el.textContent = el.textContent.replace('v1.0.0', releaseData.tag_name)
              }
            })
          }

          return latestExeDownloadUrl
        }
      }
    } catch (err) {
      console.warn('Could not auto-resolve GitHub release asset:', err)
    } finally {
      isResolvingRelease = false
    }

    return null
  }

  // Pre-fetch latest release on load so click is instantaneous
  resolveLatestRelease()

  const downloadButtons = document.querySelectorAll('.download-trigger')
  downloadButtons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      // If we already have the direct binary link resolved, let native navigation trigger download
      if (latestExeDownloadUrl) {
        showToast('Starting download for Windows...')
        return
      }

      // If clicked before the initial fetch completed, prevent default and resolve immediately
      e.preventDefault()
      showToast('Finding latest Windows installer...')

      const url = await resolveLatestRelease()
      if (url) {
        showToast('Starting download for Windows...')
        window.location.href = url
      } else {
        // Fallback to releases page
        window.location.href = RELEASES_PAGE
      }
    })
  })

  // Clean In-Page Toast Notification (no glowing effects)
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
    }, 3200)
  }
})
