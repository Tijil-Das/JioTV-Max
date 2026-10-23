# JioTv Max 📺

<p align="center">
  <img src="Website/assets/app-icon-256.png" alt="JioTv Max Logo" width="112" height="112" />
</p>

<p align="center">
  <strong>High-performance native Windows desktop application for streaming 1,000+ JioTV live channels in Full HD.</strong>
</p>

<p align="center">
  <a href="https://github.com/Tijil-Das/JioTV-Max/releases/latest"><img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=flat-square&logo=windows" alt="Platform" /></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" /></a>
</p>

---

> [!IMPORTANT]
> **Disclaimer**: JioTv Max is an independent open-source project and is not affiliated with or endorsed by Jio or Reliance Industries. Live stream playback requires an active Jio mobile subscription with bundled JioTV access.

---

## Why JioTv Max?

JioTV is locked to mobile devices and Android TVs; its web portal blocks live streaming. Android emulators (like BlueStacks) are resource-heavy and restricted to low-resolution streams due to DRM limits.

- 🖥️ **Native Full HD**: Hardware GPU-decoded 1080p and 720p streams with low CPU and RAM usage.
- 📱 **Standard Mobile Plans**: Works out of the box with any regular Jio mobile recharge—no expensive Smart TV or JioFiber plans required.
- 🔑 **Simple OTP Sign-In**: Login once with your Jio mobile number to access all live channels in your subscription.
- ⚡ **Desktop-First**: Built for Windows with instant channel zapping and Picture-in-Picture.

---

## Features

- **1,000+ Channels**: Sports, entertainment, news, movies, music, and regional broadcasts.
- **Dual Playback Engine**: `hls.js` for clear HLS streams and `shaka-player` with Widevine CDM for DASH channels.
- **Local Media Relay (`127.0.0.1`)**: Proxies manifests, injects required headers/cookies, and handles token rotation.
- **Live DVR & Timeshift**: Pause live television and scrub through rolling broadcast buffers.
- **24-Hour Virtualized EPG**: 60fps schedule guide with day navigation and genre filters.
- **Clean Channel Logos**: Multi-tier Web Worker pipeline that cleans and optimizes logos for dark themes.
- **Quick Search**: Rapid search across channel names, numbers, and categories.
- **Encrypted Token Vault**: Credentials stored securely using Windows DPAPI (`safeStorage`).
- **Auto-Updater**: Background update checks via GitHub Releases with one-click restart updates.
- **Offline Demo Mode**: 38 channels and schedules to test immediately without signing in.

---

## Quick Start

### Prerequisites
- **OS**: Windows 10 or 11 (64-bit)
- **Node.js**: v20+ & **pnpm**: v9+
- Active Jio number (for Live mode; Demo mode runs offline)

### Setup & Run

```powershell
# 1. Clone repository
git clone https://github.com/Tijil-Das/JioTV-Max.git
cd "JioTV Max/JioTV-Max-Windows"

# 2. Install dependencies (auto-configures Widevine runtime)
pnpm install

# 3. Launch desktop app
pnpm dev

# Or launch with Widevine DRM testing enabled
pnpm dev:wv
```

### Sign In
- **Demo Mode**: Select *Demo access*, enter any 10-digit number, and use OTP `123456`.
- **Live Mode**: Select *JioTV account*, enter your Jio number, and enter the OTP sent to your phone.

---

## Build & Release

```powershell
pnpm typecheck   # Typecheck TypeScript (Node + Web)
pnpm test        # Run Vitest test suite (203 tests)
pnpm build       # Compile production bundles into out/
pnpm dist        # Package Windows NSIS installer into release/
```

### Releasing Updates

Releases are fully automated through the centralized `updater-cli`. When you initiate a release, it executes the entire pipeline end-to-end—automatically streaming live build progress and ensuring differential blockmaps are published without any manual intervention:

```powershell
# Launch automated release wizard from repo root:
.\release.cmd

# Check current version, GitHub release assets, and fleet status:
.\release.cmd status
```

The CLI handles pre-flight checks, SemVer bumping, atomic git commit/tag/push, live in-terminal GitHub Actions progress streaming, and post-release verification (including delta update `.blockmap` validation and automatic upload). See [RELEASING.md](RELEASING.md).

---

## Contributing

Contributions are welcome! Please check out [CONTRIBUTING.md](CONTRIBUTING.md) for local environment setup, testing, and PR guidelines.

- Report bugs via [GitHub Issues](https://github.com/Tijil-Das/JioTV-Max/issues).
- Discuss feature ideas in [GitHub Discussions](https://github.com/Tijil-Das/JioTV-Max/discussions).

---

## License

Open source under the [MIT License](LICENSE). Copyright (c) 2026 Tijil Das.
