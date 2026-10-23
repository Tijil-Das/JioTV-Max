# JioTv Max 📺

<p align="center">
  <img src="Website/assets/app-icon-256.png" alt="JioTv Max Logo" width="128" height="128" />
</p>

<p align="center">
  <strong>A high-performance, native Windows desktop application for streaming 1,000+ JioTV live television channels in Full HD.</strong>
</p>

<p align="center">
  <a href="#key-features"><img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=flat-square&logo=windows" alt="Platform" /></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/Electron-33%20(castLabs%20CDM)-47848F?style=flat-square&logo=electron" alt="Electron" /></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/React-18.3%20%7C%20TypeScript-3178C6?style=flat-square&logo=typescript" alt="TypeScript" /></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/Bundler-Vite%20%2B%20electron--vite-646CFF?style=flat-square&logo=vite" alt="Vite" /></a>
  <a href="#contributing"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" /></a>
</p>

---

## Overview

**JioTv Max** is a dedicated open-source desktop client built for Windows 10 and 11. Built with Electron, React 18, and TypeScript, it bridges the gap between mobile streaming and desktop workstations—delivering 1,000+ live television channels directly to your PC, laptop, or multi-monitor setup in crisp Full HD.

> [!IMPORTANT]
> **Disclaimer**: JioTv Max is an independent, open-source personal project. It is **not** affiliated with, endorsed by, or supported by Jio or Reliance Industries. Channel availability, streams, and playback rights require an active Jio mobile subscription and are subject to Jio's terms of service.

---

## 💡 Why JioTv Max?

Unlike standard streaming platforms, **JioTV has no official Windows desktop client**, and its web portal does not stream live broadcasts. Official live streaming is locked to mobile devices and Android TVs.

Many users resort to running Android emulators (like BlueStacks) on PC, which introduces significant friction:
- **Restricted Quality**: Emulators lack certified hardware DRM pipelines on desktop and are restricted to degraded, low-resolution streams.
- **Heavy Resource Overhead**: Emulators consume gigabytes of RAM and heavy CPU cycles, resulting in dropped frames, heat, and fan noise.
- **Clunky Navigation**: Touch-first mobile interfaces feel awkward when navigating with a mouse and keyboard.

**JioTv Max solves this completely:**
- 🖥️ **Native Full HD Playback** — Streams live television with hardware GPU decoding in clear 1080p and 720p with minimal CPU and memory usage.
- 📱 **Works With Standard Mobile Plans (Zero Extra Cost)** — No Smart TV subscription or JioFiber set-top box required. Any regular prepaid or postpaid Jio mobile recharge with bundled JioTV access works out of the box.
- 🔑 **Simple OTP Sign-In** — Sign in once with your registered Jio mobile number via SMS OTP to access all live channels included in your plan.
- ⚡ **Desktop-First Experience** — Built specifically for Windows with keyboard shortcuts, instant channel zapping, a virtualized 24-hour EPG, Picture-in-Picture, and multi-monitor support.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture & Engineering](#architecture--engineering)
  - [Dual Playback Pipeline & Local Media Relay](#dual-playback-pipeline--local-media-relay)
  - [Intelligent Logo Normalization Pipeline](#intelligent-logo-normalization-pipeline)
  - [Virtualized 24-Hour EPG Guide](#virtualized-24-hour-epg-guide)
  - [DPAPI Token Vault](#dpapi-token-vault)
  - [Background Auto-Updater](#background-auto-updater)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation & Development](#installation--development)
  - [Signing In](#signing-in)
  - [Widevine DRM (castLabs Electron)](#widevine-drm-castlabs-electron)
- [Packaging & Production Builds](#packaging--production-builds)
- [Project Structure](#project-structure)
- [NPM Scripts Reference](#npm-scripts-reference)
- [Contributing](#contributing)
- [License](#license)

---

## Key Features

- 📺 **1,000+ Live Channels** — Instant access to national and regional sports, entertainment, news, movies, music, kids, and infotainment channels.
- ⚡ **Dual Playback Engine** — Leverages `hls.js` for low-latency HLS streams and `shaka-player` with `castLabs Electron 33` for Widevine DRM DASH streams.
- 🔄 **Zero-CORS Loopback Media Relay** — A built-in ephemeral HTTP server (`127.0.0.1`) in Electron main that proxies streams, rewrites manifests, injects Akamai security tokens (`__hdnea__`), transparently manages token rotation, and proxies DRM licenses.
- ⏪ **Live DVR & Timeshift Scrubbing** — Pause live television and scrub through rolling broadcast timeshift buffers with automatic live-edge synchronization.
- 📅 **Virtualized 24-Hour EPG Guide** — High-performance program guide powered by `@tanstack/react-virtual` with smooth horizontal time tracking, day navigation (Yesterday / Today / Tomorrow), and category filters.
- 🎨 **Adaptive Logo Normalization** — Dedicated OffscreenCanvas Web Worker pipeline that cleans, repairs alpha transparency, contrast-adjusts, and renders broadcaster logos crisply against dark backgrounds.
- 🔍 **Command-Palette Channel Search (`Ctrl+K`)** — Global instant modal search with real-time fuzzy filtering across channel names, numbers, genres, and recent channels.
- 🪟 **Desktop-Class UI & Controls** — Frameless window chrome with custom titlebar controls, Windows 11 acrylic/mica backdrop styling, auto-hiding HUD controls, Picture-in-Picture (PiP), and system sleep prevention (`powerSaveBlocker`) during active streaming.
- 🔐 **Secure Credential Vault** — Auth tokens are encrypted using Windows DPAPI (`safeStorage`) in the main process and never stored in plain text.
- 🔄 **Integrated Auto-Updater** — Seamless background update checking against GitHub Releases with silent download and one-click restart installation.
- 🧪 **100% Offline Demo Mode** — Includes 38 pre-configured channels with deterministic mock schedules and sample streams for testing without cellular credentials.

---

## Architecture & Engineering

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           JioTv Max Architecture                            │
└─────────────────────────────────────────────────────────────────────────────┘

 ┌───────────────────────────────────────────────────────────────────────────┐
 │                           Electron Main Process                           │
 │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐  │
 │  │ BrowserWindow    │  │ JioService       │  │ MediaRelay              │  │
 │  │ • Acrylic Chrome │  │ • OTP Send/Verify│  │ • 127.0.0.1 Loopback    │  │
 │  │ • Custom Window  │  │ • Channel APIs   │  │ • Manifest Rewriter     │  │
 │  │ • Power Blocker  │  │ • Stream URLs    │  │ • Akamai __hdnea__ Auth │  │
 │  │ • State Storage  │  │ • EPG Fetcher    │  │ • DRM License Relay     │  │
 │  └────────┬─────────┘  └────────┬─────────┘  │ • DVR Memory Cache      │  │
 │           │                     │            └────────────┬────────────┘  │
 │  ┌────────┴─────────┐  ┌────────┴─────────┐               │               │
 │  │ SecureStore      │  │ AssetCache       │               │               │
 │  │ • DPAPI Encrypt  │  │ • Disk /logo-cache│               │               │
 │  └──────────────────┘  └──────────────────┘               │               │
 └───────────────────────────────────┬───────────────────────┼───────────────┘
                                     │ IPC Bridge            │ HTTP Stream
                                     ▼                       ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                           Preload Isolated Bridge                         │
 │   window.api: { channels, streams, assets, auth, secure, toggleFullscreen }│
 └───────────────────────────────────┬───────────────────────────────────────┘
                                     │ Context Isolation (webSecurity: true)
                                     ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                           React 18 Renderer                               │
 │                                                                           │
 │  ┌─────────────────────────────────────────────────────────────────────┐  │
 │  │ Zustand Stores: useAuthStore · useChannelStore · usePlayerStore     │  │
 │  └─────────────────────────────────────────────────────────────────────┘  │
 │                                                                           │
 │  ┌───────────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
 │  │ useMediaPlayer Hook   │  │ Offscreen Worker │  │ UI View Layer      │  │
 │  │ • hls.js (HLS live)   │  │ • Logo Pipeline  │  │ • Virtual EPG Guide│  │
 │  │ • shaka-player (DASH) │  │ • IndexedDB DB   │  │ • Cinema Player    │  │
 │  │ • Live Edge & DVR     │  │ • Knockout/As-is │  │ • Hero Spotlight   │  │
 │  └───────────────────────┘  └──────────────────┘  └────────────────────┘  │
 └───────────────────────────────────────────────────────────────────────────┘
```

### Dual Playback Pipeline & Local Media Relay

JioTV streams require specific mobile client headers, dynamic Akamai security cookies (`__hdnea__`), and Widevine DRM license authorization. Standard desktop browsers and Electron renderers encounter strict CORS policies and header limitations when requesting these endpoints directly.

JioTv Max solves this through a zero-footprint loopback server (`MediaRelay`) running in the main process on `127.0.0.1`:
- **Manifest Rewriting**: Dynamic HLS master playlists and DASH manifests are rewritten on-the-fly to route encrypted segment requests through the local relay port.
- **Header & Token Injection**: The relay carries session identification with upstream requests, injecting valid `User-Agent` headers, tokens, and cookies transparently.
- **Widevine License Proxying**: Intercepts Encrypted Media Extensions (EME) license challenges, attaches necessary authorization tokens, and returns decrypted keys.
- **DVR In-Memory Buffer**: Broadcast media segments are cached in memory (LRU cache with sliding TTL), enabling instant micro-rewinds and scrubbing without re-requesting from upstream CDNs.
- **Automatic Token Rotation**: Detects expired stream tokens (401/403 responses), resolves fresh stream authorizations in the background, and resumes playback seamlessly without dropping frames.

### Intelligent Logo Normalization Pipeline

Broadcast channel logos vary wildly in quality: some have solid white backgrounds, low-contrast dark ink, uneven padding, or non-standard aspect ratios. The built-in worker pipeline standardizes every channel emblem for a dark interface:
1. **Secure Main-Process Fetch**: Logos are fetched through `asset:fetch` in Node.js and cached locally under `userData/logo-cache`, preventing canvas tainting in Chromium.
2. **OffscreenCanvas Web Worker**: Worker threads inspect RGBA pixels, calculate alpha coverage, luminance, and bounding boxes.
3. **Multi-Tier Resolution**:
   - `asis`: Preserves colors while applying alpha repair for backdrops and edge rimming for low-contrast ink.
   - `knockout`: Logos with poor contrast are dynamically recolored to high-legibility crisp white ink (`#F2F2F4`).
   - `monogram`: Clean typographic fallback rendered when artwork is missing or invalid.
4. **IndexedDB Caching**: Processed bitmaps are stored in IndexedDB (`jiotv-logo-pipeline`), eliminating repetitive processing across application launches.

### Virtualized 24-Hour EPG Guide

- **High-Performance Virtualization**: Virtualized row rendering with `@tanstack/react-virtual` delivers smooth 60fps scrolling across 1,000+ channels and thousands of schedule entries.
- **Synced Horizontal Timeline**: The time ruler's scroll handler directly updates a `--guide-x` CSS property on the document body, driving row translation via GPU compositing without React re-render thrashing.

### DPAPI Token Vault

- **Zero Plaintext Tokens**: User credentials and session tokens never enter `localStorage` or unencrypted application files.
- **Hardware-Backed Encryption**: The main process encrypts authentication tokens using Windows Data Protection API (DPAPI) via Electron's `safeStorage`.
- **Strict Content Security Policy (CSP)**: Compiled production builds enforce a locked-down CSP preventing arbitrary script injection.

### Background Auto-Updater

- Seamless integration with `electron-updater` checking GitHub Releases for updates every 20 minutes in the background.
- Employs differential NSIS blockmaps (`.blockmap`) to minimize download bandwidth.
- Non-intrusive notifications when an update is downloaded and ready to apply.

---

## Keyboard Shortcuts

The player is fully controllable via the keyboard:

| Key | Action |
| :---: | :--- |
| <kbd>Space</kbd> | Play / Pause toggle |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Channel down / Channel up (instant zapping) |
| <kbd>←</kbd> / <kbd>→</kbd> | Volume decrease / increase (5% increments) |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>M</kbd> | Mute / Unmute audio |
| <kbd>C</kbd> | Open slide-out Channel Drawer |
| <kbd>Q</kbd> | Open Stream Quality selection menu |
| <kbd>P</kbd> | Toggle Picture-in-Picture (PiP) window |
| <kbd>?</kbd> | Open Keyboard Shortcuts cheat-sheet |
| <kbd>Esc</kbd> | Exit overlays / Return from player |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | Open global Channel Search palette |

---

## Quick Start

### Prerequisites

- **Operating System**: Windows 10 or Windows 11 (64-bit).
- **Node.js**: Version 20 or higher.
- **Package Manager**: `pnpm` (v9 or v10 recommended).
- **Subscription**: An active Jio mobile number with bundled JioTV access (required only for Live Mode; Demo mode works offline with no credentials).

### Installation & Development

1. **Clone the repository**:
   ```powershell
   git clone https://github.com/Tijil-Das/JioTV-Max.git "JioTV Max"
   cd "JioTV Max/JioTV-Max-Windows"
   ```

2. **Install dependencies**:
   ```powershell
   pnpm install
   ```

3. **Launch the development environment**:
   ```powershell
   # Standard Electron development (Demo mode + HLS channels)
   pnpm dev
   ```

   *Optional web preview (browser-only development)*:
   ```powershell
   pnpm dev:web
   ```

### Signing In

The application starts in **Demo mode** on its first run:
- Click **Sign in** in the top navigation bar.
- To test in **Demo mode**, choose **Demo access**, enter any valid 10-digit Indian phone number (starting with 6–9), and enter the demo OTP:
  ```
  123456
  ```
- To switch to **Live JioTV mode**, select **JioTV account**, enter your registered Jio mobile number, and submit the 6-digit OTP sent to your phone.

### Widevine DRM (castLabs Electron)

For live channels requiring Widevine DRM under DASH, JioTv Max integrates castLabs Electron with an automated setup:

- Run from `JioTV-Max-Windows`:
  ```powershell
  pnpm dev:wv
  ```
- The setup script automatically verifies and downloads the official castLabs Electron release (`v33.3.2+wvcus`) if not present, extracting it into `.castlabs/` and launching the application with Widevine enabled.

---

## Packaging & Production Builds

From within the `JioTV-Max-Windows` directory:

```powershell
# 1. Typecheck both Node and Web TypeScript targets
pnpm typecheck

# 2. Run unit test suites (203+ tests)
pnpm test

# 3. Build production bundles into out/
pnpm build

# 4. Create an unpacked Windows directory in release/win-unpacked
pnpm run pack:dir

# 5. Build the complete standalone NSIS installer in release/
pnpm dist
```

### Automated Releases & CI/CD

Production setup installers (`.exe`), differential blockmaps (`.blockmap`), and release manifests are built automatically using GitHub Actions upon pushing a release tag. See [RELEASING.md](RELEASING.md) for details.

---

## Project Structure

```
JioTV Max/
├── JioTV-Max-Windows/          # Desktop application for Windows 10 & 11
│   ├── .github/workflows/      # CI/CD and release build workflows
│   ├── build/                  # Windows application icons and installer assets
│   ├── scripts/                # Packaging, icon generation, and Widevine runners
│   ├── src/
│   │   ├── main/               # Electron Main: MediaRelay, JioService, SecureStore, Updater
│   │   ├── preload/            # Context-isolated IPC Bridge (window.api)
│   │   ├── renderer/           # React 18: Components, hooks, Zustand stores, pages
│   │   │   └── src/workers/    # Web Worker: OffscreenCanvas logo normalization
│   │   └── shared/             # Shared TypeScript types, IPC channels, and error definitions
│   ├── test/ & tests/          # Comprehensive Vitest test suites (203+ tests)
│   ├── package.json            # Application dependencies and build scripts
│   └── electron.vite.config.ts # Vite and Electron build configuration
└── Website/                    # Landing page and promotional showcase assets
    ├── assets/                 # Brand icons and website imagery
    ├── index.html              # Showcase landing page
    ├── script.js               # Interactive scripts & dynamic release downloader
    └── style.css               # Clean typography and dark styling
```

---

## NPM Scripts Reference

| Command | Purpose |
| :--- | :--- |
| `pnpm dev` | Starts Electron + Vite development servers with Hot Module Replacement (HMR). |
| `pnpm dev:wv` | Launches development server with castLabs Electron for Widevine DRM testing. |
| `pnpm dev:web` | Runs the Vite renderer in the browser on `http://localhost:5173`. |
| `pnpm build` | Compiles main, preload, and renderer packages into `out/` with production CSP. |
| `pnpm preview` | Previews the compiled production build locally. |
| `pnpm typecheck` | Validates TypeScript types across Node and Web compilation configs. |
| `pnpm test` | Runs the Vitest test suite. |
| `pnpm test:logos` | Runs dedicated logo normalization tests against test fixtures. |
| `pnpm run pack:dir`| Builds an unpacked Windows executable directory in `release/win-unpacked`. |
| `pnpm dist` | Packages the complete NSIS standalone Windows installer in `release/`. |
| `pnpm icon` | Re-generates application icon assets (`build/icon.ico`, `build/icon.png`). |

---

## Contributing

Contributions from the open-source community are warmly welcome. Whether you are fixing an issue, improving playback stability, optimizing resource consumption, or refining the user experience, your help is appreciated.

### How to Contribute

1. **Explore Existing Issues**: Check the [GitHub Issues](https://github.com/Tijil-Das/JioTV-Max/issues) to find open bug reports, feature discussions, or to propose a new improvement.
2. **Fork the Repository**: Create a fork of the repo to your own GitHub account.
3. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```
4. **Make Your Changes**: Keep modifications focused and clean. Ensure that code follows existing formatting and architectural conventions.
5. **Verify Quality**:
   ```powershell
   cd JioTV-Max-Windows
   pnpm typecheck
   pnpm test
   ```
6. **Submit a Pull Request**: Push your branch to GitHub and open a Pull Request with a clear description of the problem solved and the changes made.

### Areas Where Contributions Are Welcomed

- ⚡ **Streaming & Playback**: Enhancing playback buffering, adaptive bitrate heuristics, stream recovery on network drops, and codec support.
- 🎨 **UI/UX Refinements**: Accessibility improvements, smoother transitions, keyboard navigation polish, and multi-monitor edge case handling.
- 📺 **EPG & Metadata**: Improving EPG caching efficiency, schedule parsing robustness, and program metadata richness.
- 🧪 **Testing & Quality Assurance**: Expanding unit and integration test coverage across player edge cases and authentication flows.
- 📖 **Documentation**: Clarifying setup guides, troubleshooting steps, and developer documentation.

Please maintain a collaborative, respectful, and constructive tone in all discussions and pull requests.

---

## License

This project is licensed under the [MIT License](LICENSE).

```
MIT License

Copyright (c) 2026 Tijil Das

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

*All television channel names, logos, streams, and trademarks are the property of their respective owners.*
