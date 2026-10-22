/**
 * JioTv Max — Official Landing Page JavaScript
 * Lightweight, dependency-free vanilla JS for silky interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Interactive Mockup Tab Switcher
  const tabButtons = document.querySelectorAll('.mockup-tab-btn')
  const scenes = document.querySelectorAll('.mockup-scene')

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetSceneId = button.getAttribute('data-scene')

      tabButtons.forEach((btn) => btn.classList.remove('active'))
      scenes.forEach((scene) => scene.classList.remove('active'))

      button.classList.add('active')
      const targetScene = document.getElementById(targetSceneId)
      if (targetScene) {
        targetScene.classList.add('active')
      }
    })
  })

  // 2. Clipboard Copy Button for Git Clone
  const copyBtn = document.getElementById('copy-cmd-btn')
  const cmdCode = document.getElementById('clone-cmd-text')

  if (copyBtn && cmdCode) {
    copyBtn.addEventListener('click', async () => {
      try {
        const textToCopy = cmdCode.textContent.trim()
        await navigator.clipboard.writeText(textToCopy)
        
        const originalHtml = copyBtn.innerHTML
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span style="color: #4ADE80;">Copied!</span>
        `
        
        setTimeout(() => {
          copyBtn.innerHTML = originalHtml
        }, 2200)
      } catch (err) {
        console.error('Failed to copy command:', err)
      }
    })
  }

  // 3. GitHub Latest Release Windows Binary (.exe) Auto-Resolver & Downloader
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
      // If we already have the direct binary link resolved, let native navigation trigger the download
      if (latestExeDownloadUrl) {
        showToast('Starting download for Windows...')
        return
      }

      // If clicked before the initial fetch completed, prevent default and try resolving immediately
      e.preventDefault()
      showToast('Finding latest Windows installer...')

      const url = await resolveLatestRelease()
      if (url) {
        showToast('Starting download for Windows...')
        window.location.href = url
      } else {
        // Graceful fallback: navigate directly to latest releases page on GitHub
        window.location.href = RELEASES_PAGE
      }
    })
  })

  // 4. Lightweight In-Page Toast Notification
  function showToast(message) {
    let toast = document.getElementById('site-toast')
    if (!toast) {
      toast = document.createElement('div')
      toast.id = 'site-toast'
      toast.style.position = 'fixed'
      toast.style.bottom = '28px'
      toast.style.left = '50%'
      toast.style.transform = 'translateX(-50%) translateY(20px)'
      toast.style.background = 'rgba(17, 17, 19, 0.95)'
      toast.style.backdropFilter = 'blur(16px)'
      toast.style.color = '#F4F4F5'
      toast.style.border = '1px solid rgba(225, 29, 46, 0.45)'
      toast.style.padding = '12px 24px'
      toast.style.borderRadius = '100px'
      toast.style.fontSize = '13.5px'
      toast.style.fontWeight = '500'
      toast.style.boxShadow = '0 12px 32px rgba(0,0,0,0.8), 0 0 20px rgba(225, 29, 46, 0.25)'
      toast.style.opacity = '0'
      toast.style.transition = 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
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
      toast.style.transform = 'translateX(-50%) translateY(20px)'
    }, 3800)
  }

  // 5. Header scroll blur intensity
  const header = document.querySelector('.site-header')
  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
      header.style.background = 'rgba(5, 5, 7, 0.92)'
      header.style.borderColor = 'rgba(255, 255, 255, 0.12)'
    } else {
      header.style.background = 'var(--glass-bg)'
      header.style.borderColor = 'var(--glass-border)'
    }
  }, { passive: true })
})
