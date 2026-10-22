# JioTv Max 📺

<p align="center">
  <img src="Website/assets/app-icon-256.png" alt="JioTv Max Logo" width="128" height="128" />
</p>

<p align="center">
  <strong>A cinematic, ultra-responsive Windows desktop experience for JioTV live television.</strong>
</p>

<p align="center">
  <a href="#highlights"><img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=flat-square&logo=windows" alt="Platform" /></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/Electron-33%20(castLabs%20CDM)-47848F?style=flat-square&logo=electron" alt="Electron" /></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/React-18.3%20%7C%20TypeScript-3178C6?style=flat-square&logo=typescript" alt="TypeScript" /></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/Bundler-Vite%20%2B%20electron--vite-646CFF?style=flat-square&logo=vite" alt="Vite" /></a>
  <a href="#design-system"><img src="https://img.shields.io/badge/Style-Tailwind%20%2B%20Framer%20Motion-06B6D4?style=flat-square&logo=tailwindcss" alt="Styling" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" /></a>
</p>

---

**JioTv Max** is a ground-up reimagining of live television for Windows. Built with Electron, React 18, and TypeScript, it pairs the full JioTV catalogue with a modern cinema front end: frameless acrylic chrome, instant channel zapping, an imperative-sync 24-hour EPG, an intelligent multi-tier channel logo engine, and a dual HLS / Widevine DASH playback pipeline powered by an internal loopback media relay.

The app starts out of the box in **Demo mode** with 38 pre-configured channels, deterministic schedules, and local streams so everything works offline. Switching to **JioTV mode** connects directly to live JioTV APIs with end-to-end hardware-backed token security.

> [!IMPORTANT]
> **Disclaimer**: JioTv Max is an independent, open-source personal project. It is **not** affiliated with, endorsed by, or supported by Jio or Reliance Industries. Channel availability, streams, and playback rights are subject to an active JioTV subscription and Jio's terms of service.

---

## Table of Contents

- [Why JioTv Max?](#why-jiotv-max-big-screen-live-tv-on-windows)
- [Highlights](#highlights)
- [Design System](#design-system)
- [Architecture & Engineering](#architecture--engineering)
  - [Dual Playback Pipeline & Local Media Relay](#dual-playback-pipeline--local-media-relay)
  - [Intelligent Logo Normalization Pipeline](#intelligent-logo-normalization-pipeline)
  - [Virtualized 24-Hour EPG Guide](#virtualized-24-hour-epg-guide)
  - [Security & Token Vault](#security--token-vault)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation & Development](#installation--development)
  - [Signing In](#signing-in)
  - [Widevine DRM Setup (castLabs Electron)](#widevine-drm-setup-castlabs-electron)
- [Packaging & Production Builds](#packaging--production-builds)
- [Project Structure](#project-structure)
- [NPM Scripts Reference](#npm-scripts-reference)
- [Automated Verification Harness](#automated-verification-harness)
- [License](#license)

---

## 💡 Why JioTv Max? (Big-Screen Live TV on Windows)

Unlike standard streaming services, **JioTV has no official Windows desktop app**, and its web portal does not stream live television. If you are sitting at a desktop PC, laptop, or multi-monitor workstation, you are officially locked out of watching live broadcasts on a large display.

**JioTv Max solves this completely:**

- 🖥️ **Bigger Screens, No Boundaries** — Enjoy 1,000+ live television channels directly on Windows 10 & 11 in native 1080p, with zero emulator lag and hardware GPU decoding.
- 📱 **Works With Any Standard Mobile Plan (Zero Extra Cost)** — **You do not need a Smart TV subscription, JioFiber TV set-top box, or an expensive large-screen add-on.** Any regular prepaid or postpaid Jio mobile recharge bundled with basic JioTV mobile access works seamlessly out of the box.
- 🔑 **Simple OTP Login** — Simply sign in with your Jio mobile number via OTP. Whatever channels and live content your plan supports on mobile are immediately unlocked on your PC monitor or TV.
- ⚡ **Native Performance** — Forget running heavy, resource-draining Android emulators (like BlueStacks) that peg your CPU and throttle video framerates. JioTv Max runs lean, fast, and responsive.

---

## Highlights

- 🎬 **Black Screening Room Chrome** — True-black (`#000000`) canvas, signature `#E11D2E` cinema red accents, frameless title bar with custom window controls (minimize, maximize, restore, close), Windows 11 Mica/Acrylic backdrop support, and system `powerSaveBlocker` during playback.
- ⚡ **Dual HLS & DASH/Widevine Engines** — `hls.js` for instant low-latency HLS streaming; `shaka-player` with `castLabs Electron 33` for Widevine DRM channels with proxied license acquisition.
- 🔄 **Zero-CORS Loopback Media Relay** — Ephemeral `127.0.0.1` relay in the Electron main process that rewrites manifests, proxies chunks, injects Akamai `__hdnea__` cookies, transparently handles 401/403 token rotations, and caches DVR segments in memory without breaking Chromium `webSecurity`.
- 🎨 **Multi-Tier Logo Pipeline (Worker + OffscreenCanvas)** — Automatically cleans, centers, contrast-boosts, and normalizes live broadcast channel logos. Tiers: `asis` (repaired alpha/dark ink lift), `knockout` (recolored crisp `#F2F2F4`), and `monogram` fallback with IndexedDB and disk caching.
- 📅 **Virtualized 24-Hour EPG Guide** — High-performance grid powered by TanStack Virtual. Imperative horizontal ruler synchronization via `--guide-x` CSS property avoids rAF throttling in occluded windows. Complete with day navigation (Yesterday / Today / Tomorrow), genre filters, and "Jump to Now".
- 📺 **Cinema Player Experience** — Full-bleed playback with auto-hiding controls (3.2s idle wake), live DVR timeline scrubbing with out-of-window gap detection, pinned stream quality presets (1080p, 720p, 480p, Auto), quick slide-out channel drawer, and Picture-in-Picture (PiP).
- 🔍 **Command-Palette Search (`Ctrl+K`)** — Global instant modal search with real-time fuzzy filtering across channel names, numbers, categories, and recent history.
- 🔐 **OS-Keychain Token Protection** — Phone + OTP sign-in with phone normalization (`+91` base64 payload). Tokens never touch the renderer; all credentials are encrypted via Windows DPAPI (`safeStorage`) in the main process.
- 🌐 **100% Offline Demo Mode** — 38 curated channels, deterministic mock EPG generation, and offline streams. Test and inspect without needing active cellular credentials.

---

## Design System

JioTv Max follows a strict **"Black Screening Room / Single Red Light"** design language:

| Token | Value | Purpose |
| :--- | :--- | :--- |
| **Canvas** | `#000000` | Pure black viewport backdrop, eliminates light bleed |
| **Surface 1** | `#0A0A0B` | Navigation rail, dialog surfaces, settings cards |
| **Surface 2** | `#111113` | Inputs, interactive control wells, channel plates |
| **Surface 3** | `#18181B` | Elevated hover states, active pill backgrounds |
| **Plate Rest / Hover** | `#0E0E10` / `#151518` | Channel icon tiles with 16px radius and subtle hairlines |
| **Accent Red** | `#E11D2E` | Live broadcast indicators, active navigation marks, primary actions |
| **Red Line Focus** | `rgba(225, 29, 46, 0.55)` | 2px accessible focus ring across all keyboard navigation |
| **Glass Recipe** | `rgba(10, 10, 11, 0.72)` + `blur(28px)` | Scrolled TopBar, dropdown menus, player controls |
| **Typography** | `Inter Variable` & `Plus Jakarta Sans` | Tabular numbers enabled (`tnum`, `cv11`, `ss01`) for clocks & guides |

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
 │  │ • Acrylic / Mica │  │ • OTP Send/Verify│  │ • 127.0.0.1 Loopback    │  │
 │  │ • Custom Chrome  │  │ • Channel APIs   │  │ • Manifest Rewriter     │  │
 │  │ • Power Block    │  │ • Playback URLs  │  │ • Akamai __hdnea__ Auth │  │
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
 │  │ Zustand Stores: useChannelStore · usePlayerStore · useSettingsStore │  │
 │  └─────────────────────────────────────────────────────────────────────┘  │
 │                                                                           │
 │  ┌───────────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
 │  │ useMediaPlayer Hook   │  │ Offscreen Worker │  │ UI View Layer      │  │
 │  │ • hls.js (HLS live)   │  │ • Logo Pipeline  │  │ • Virtual Guide    │  │
 │  │ • shaka-player (DASH) │  │ • IndexedDB DB   │  │ • Cinema Player    │  │
 │  │ • Live Edge & DVR     │  │ • Knockout/As-is │  │ • Hero Spotlight   │  │
 │  └───────────────────────┘  └──────────────────┘  └────────────────────┘  │
 └───────────────────────────────────────────────────────────────────────────┘
```

### Dual Playback Pipeline & Local Media Relay

JioTV streams require specific Android client headers, dynamic Akamai security cookies (`__hdnea__`), and Widevine DRM license authorization. Standard browsers or Electron renderers encounter CORS barriers and custom header restrictions when requesting these directly.

JioTv Max solves this with a zero-footprint loopback server (`MediaRelay`):
- **Manifest Rewriting (`/raw`)**: Master playlists and child media playlists are rewritten on-the-fly to route segments through the local relay port.
- **Header Injection & Cookie Management**: The relay carries session identification with every request, injecting authenticated headers (`User-Agent`, cookies, tokens) upstream.
- **Widevine License Proxying (`/license`)**: Intercepts EME license challenges, attaches necessary authorization tokens, and returns decrypted keys.
- **DVR In-Memory Buffer**: Immutable broadcast segments are cached in memory (up to 64MB LRU cache with 2-minute TTL), enabling instant micro-rewinds and scrubbing without hitting CDN rate limits.
- **Automatic Token Rotation**: Detects 401/403 stream token expirations, coalesces concurrent requests, re-resolves fresh stream URLs, and resumes playback without dropped frames.

### Intelligent Logo Normalization Pipeline

Raw broadcaster logos vary wildly: solid white backgrounds, low-contrast black ink, bad padding, or non-standard aspect ratios. The built-in worker pipeline standardizes every channel emblem:
1. **Main Process Secure Fetch**: Logos are fetched through `asset:fetch` in Node.js, caching the raw binary under `userData/logo-cache` and preventing canvas tainting in Chromium.
2. **OffscreenCanvas Web Worker**: Worker threads inspect RGBA pixels, calculate alpha coverage, luminance, ink contrast, and bounding boxes.
3. **Multi-Tier Resolution**:
   - `asis`: Colors preserved with automatic alpha repair for black/white backdrops and edge rimming for low-contrast ink.
   - `knockout`: Logos with poor contrast are dynamically recolored to high-legibility `#F2F2F4` white ink.
   - `monogram`: Clean typographic monogram rendered when source artwork is invalid or unavailable.
4. **IndexedDB Cache**: Processed bitmaps are stored in IndexedDB (`jiotv-logo-pipeline`), eliminating reprocessing on subsequent launches.

### Virtualized 24-Hour EPG Guide

- Virtualized row rendering with `@tanstack/react-virtual` delivers instant 60fps scrolling across 1,000+ channels.
- **Imperative Scroll Synchronization**: Horizontal time scrolling is decoupled from React re-renders. The time ruler's scroll handler directly updates a `--guide-x` CSS variable on the document body, driving row translation via GPU compositing without rAF throttling in background windows.

### Security & Token Vault

- **Zero Plaintext Tokens**: Credentials and session tokens never reach `localStorage` or React state.
- **Windows DPAPI Encryption**: Main process encrypts auth payloads with Electron's `safeStorage` API.
- **Strict Content Security Policy (CSP)**: `electron.vite.config.ts` automatically compiles and injects a strict CSP in production builds.

---

## Keyboard Shortcuts

The player is fully controllable via the keyboard:

| Key | Action |
| :---: | :--- |
| <kbd>Space</kbd> | Play / Pause toggle |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Previous / Next channel (instant zapping) |
| <kbd>←</kbd> / <kbd>→</kbd> | Volume decrease / increase (5% increments) |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>M</kbd> | Mute / Unmute audio |
| <kbd>C</kbd> | Open slide-out Channel Drawer |
| <kbd>Q</kbd> | Open Stream Quality selection menu |
| <kbd>P</kbd> | Toggle Picture-in-Picture (PiP) window |
| <kbd>?</kbd> | Open Shortcuts Reference cheat-sheet |
| <kbd>Esc</kbd> | Exit overlays / Return from player |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | Open global Channel Search palette |

---

## Quick Start

### Prerequisites

- **OS**: Windows 10 or Windows 11 (64-bit).
- **Runtime**: Node.js 22+ and pnpm 10+.
- **Account**: A valid Jio number with an active JioTV subscription (required only for Live Mode; Demo mode works offline with zero credentials).

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

   *Optional web preview (renderer only in browser)*:
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
- To switch to **Live JioTV mode**, toggle to **JioTV account** in the login dialog or via **Settings → Playback**, enter your registered Jio mobile number, and submit the 6-digit OTP received via SMS.

### Widevine DRM Setup (Automated castLabs Electron)

For live channels requiring Widevine DRM under DASH, JioTv Max integrates castLabs Electron with an automated setup:

- Simply run from `JioTV-Max-Windows`:
  ```powershell
  pnpm dev:wv
  ```
- If castLabs Electron is not found locally, the script automatically downloads the official `v33.3.2+wvcus` release from GitHub, extracts it into `.castlabs/castlabs-electron-33`, and launches the application with Widevine enabled. No manual installation is required on any machine.
- You can optionally point to an existing install using the `CASTLABS_ELECTRON_DIR` environment variable.

---

## Packaging & Production Builds

JioTv Max packages into a standalone unpacked directory or a production NSIS installer. From within `JioTV-Max-Windows`:

```powershell
# Typecheck both Node and Web TypeScript targets
pnpm typecheck

# Execute unit tests (including logo pipeline verification)
pnpm test

# Build the production bundles into out/
pnpm build

# Create an unpacked Windows binary in release/win-unpacked
pnpm run pack:dir

# Create a full NSIS installer executable in release/
pnpm dist
```

---

## Project Structure

The repository is organized into two primary, independent categories:

```
JioTV Max/
├── JioTV-Max-Windows/          # Desktop application for Windows 10 & 11
│   ├── .github/workflows/      # Automated CI & release build workflows
│   ├── build/                  # App icon and installer artwork
│   ├── scripts/                # Widevine launcher, installer & signing hooks
│   ├── src/                    # Electron Main, Preload, and React 18 Renderer
│   ├── test/ & tests/          # Comprehensive Vitest test suites (203+ tests)
│   ├── package.json            # Windows application dependencies & scripts
│   ├── pnpm-lock.yaml          # Frozen dependency lockfile
│   └── electron.vite.config.ts # Electron-Vite configuration
└── Website/                    # Landing site and promotional web assets
    ├── assets/                 # Brand icons and website imagery
    ├── index.html              # Responsive landing page
    ├── script.js               # Interactive showcase scripts & download resolver
    └── style.css               # Clean modern typography and dark theme styling
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
| `pnpm typecheck` | Validates TypeScript types across both Node and Web compilation configs. |
| `pnpm test` | Runs the Vitest test suite. |
| `pnpm test:logos` | Runs dedicated image normalization tests against fixture sets. |
| `pnpm run pack:dir`| Builds an unpacked Windows executable directory in `release/win-unpacked`. |
| `pnpm dist` | Packages the complete NSIS standalone Windows installer in `release/`. |
| `pnpm icon` | Re-generates the high-resolution brand icon (`build/icon.png`) via PowerShell. |

---

## Automated Verification Harness

JioTv Max includes an integrated headless capture harness for automated visual regression testing and smoke testing of production builds:

```powershell
# 1. Compile the production bundles
pnpm build

# 2. Configure target routes to capture
$env:STREAMDECK_CAPTURE="/,/guide,/settings,/watch/ch-101"
$env:STREAMDECK_CAPTURE_DIR="$env:TEMP\jiotv-capture"

# 3. Launch the harness
pnpm exec electron out/main/index.js --user-data-dir="$env:TEMP\jiotv-profile"
```

The harness cold-loads each route with clean state, records high-resolution PNG snapshots in `$env:STREAMDECK_CAPTURE_DIR`, verifies that no renderer errors occurred, and logs the execution trajectory to `streamdeck-capture.log`.

---

## License

This project is open-source under the terms of the [MIT License](LICENSE).

```
MIT License

Copyright (c) 2026 StreamDeck / Tijil Das

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
