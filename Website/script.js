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

  // ─── App Preview Showcase Tabs ──────────────────────────────────────────
  const showcaseTabs = document.querySelectorAll('.showcase-tab')
  const showcasePanels = document.querySelectorAll('.showcase-panel')

  showcaseTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-target')
      if (!targetId) return

      showcaseTabs.forEach((t) => {
        t.classList.remove('active')
        t.setAttribute('aria-selected', 'false')
      })
      showcasePanels.forEach((p) => {
        p.classList.remove('active')
        p.hidden = true
      })

      tab.classList.add('active')
      tab.setAttribute('aria-selected', 'true')

      const targetPanel = document.getElementById(targetId)
      if (targetPanel) {
        targetPanel.classList.add('active')
        targetPanel.hidden = false
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
