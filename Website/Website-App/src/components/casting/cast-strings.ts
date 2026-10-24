/**
 * Centralized strings and localization for the Casting feature.
 */

export const CAST_STRINGS = {
  buttonTooltip: 'Cast to TV',
  buttonActiveTooltip: 'Casting to TV (Click to view controls)',
  dialogTitle: 'Cast to a TV',
  betaBadge: 'BETA',
  searchingText: 'Looking for devices on your Wi-Fi…',
  emptyTitle: 'No devices found',
  emptySubtitle:
    'Make sure your TV or Chromecast is turned on and connected to the same Wi-Fi as this computer.',
  searchAgainButton: 'Search again',
  helpButton: 'Help & Troubleshooting',
  openOnAnotherDevice: 'Cast to Smart TV Browser or Phone',
  openOnAnotherDeviceSubtitle:
    'Plays DRM streams natively in any Smart TV browser (LG webOS, Samsung Tizen, Fire TV, Android TV) or phone.',
  connectingPrefix: 'Connecting to',
  connectingSubtitle: 'Preparing TV stream…',
  cancelButton: 'Cancel',
  retryButton: 'Try again',
  showDetails: 'Show technical details',
  hideDetails: 'Hide technical details',
  copyDiagnostics: 'Copy diagnostics',
  copiedDiagnostics: 'Diagnostics copied to clipboard!',
  stopCasting: 'Stop casting',
  stoppedCastingToast: 'Stopped casting',
  disconnectedToast: (deviceName: string) => `Disconnected from ${deviceName}`,
  castingTo: (deviceName: string) => `Casting to ${deviceName}`,
  statusPlaying: 'Playing',
  statusPaused: 'Paused',
  statusBuffering: 'Buffering',
  helpTitle: 'Troubleshooting Checklist',
  helpChecklist: [
    'Make sure your Smart TV or Chromecast is powered on and awake.',
    'Confirm both this PC and your TV are on the same local Wi-Fi / subnet.',
    'Disconnect any active VPN or virtual network adaptors.',
    'If Windows Firewall prompted, ensure access was allowed for Private networks.',
    'Ensure your router does not have "AP Isolation" or "Client Isolation" turned on.',
    'For DLNA / UPnP TVs (Samsung, LG, Sony), ensure "Media Sharing", "Screen Share", or "Renderer" is enabled in your TV network settings.'
  ],
  fallbackModalTitle: 'Smart TV Browser & Mobile Receiver',
  fallbackModalSubtitle:
    'Open the link below in your Smart TV browser (LG webOS, Samsung Tizen, Fire TV) or scan the QR code with your phone for native Widevine playback.',
  fallbackCopyLink: 'Copy Link',
  fallbackCopied: 'Link copied to clipboard!',
  closeButton: 'Close'
} as const
