# StreamDeck TV

A premium Windows desktop front end for live television, built with Electron,
React 18 and TypeScript. StreamDeck TV pairs a JioTV catalogue with a cinematic
interface: a rotating hero, a real 24-hour guide, instant channel zapping and an
HLS/DASH player with quality control.

The app starts in **Demo mode** with 38 channels and a generated schedule, so
everything works offline. Signing in with a JioTV number switches to the live
catalogue and streams.

> StreamDeck TV is an independent project. It is not affiliated with, endorsed
> by, or supported by Jio. Channel availability and playback are subject to
> your JioTV subscription and Jio's terms of service.

## Highlights

- **Cinematic shell** — frameless window with a custom title bar, Windows 11
  acrylic/mica when available, saved bounds, F11/Esc fullscreen and
  `powerSaveBlocker` during playback.
- **Home** — five-channel auto-rotating hero, category tiles, Continue watching,
  Live right now and curated shelves with live progress on every card.
- **Guide** — virtualised 24-hour EPG, hour ruler, day navigation, category
  filters, jump-to-now and deep links from channel cards.
- **Player** — hls.js for HLS, lazily loaded shaka-player for DASH/Widevine,
  pinned quality (defaults to 1080p), a channel drawer, PiP, keyboard shortcuts,
  auto-hiding controls, buffering/retry states and a parental PIN gate.
- **Sign-in** — phone → OTP flow with paste-aware six-box input, resend timer,
  demo/JioTV modes, success animation. Tokens never reach the renderer; they are
  encrypted with the OS keychain in the main process.
- **Settings** — playback preferences, account mode, reduced motion, parental
  controls, data cleanup, shortcuts and app information.

## Requirements

- Windows 10 or 11 (the window chrome and packaging targets are Windows-first).
- Node.js 22+ and pnpm 10+.
- A JioTV account only if you want the live catalogue; Demo mode needs nothing.

## Quick start

```powershell
pnpm install
pnpm dev
```

The first launch opens in Demo mode. Choose **Sign in → Demo access**, enter any
valid Indian mobile number (starting with 6–9) and use the demo code:

```
123456
```

Real JioTV sign-in uses the same flow but sends an OTP through Jio; the mode
switch is inside the sign-in dialog and in Settings → Playback.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Electron + Vite dev server with HMR |
| `pnpm dev:web` | Renderer only at `http://localhost:5173` |
| `pnpm build` | Production build in `out/` (injects the strict CSP) |
| `pnpm preview` | Preview the production build |
| `pnpm typecheck` | Type-check main/preload and renderer projects |
| `pnpm test` | Run the Vitest suite |
| `pnpm run pack:dir` | Unpacked Windows app in `release/win-unpacked` |
| `pnpm dist` | NSIS installer in `release/` |
| `pnpm icon` | Regenerate `build/icon.png` from the brand mark |

`pack:dir` and `dist` set `ELECTRON_BUILDER_CACHE` and `ELECTRON_CACHE` to
`T:\DevLibs` because this workstation keeps package and Electron caches on that
drive. Adjust `.npmrc` and those two scripts if your machine uses different
paths.

> Do not name an npm script `pack`; pnpm reserves that command for tarballs.

## Architecture

```
src/
  main/                 Electron main process
    index.ts            window, IPC, fullscreen, power blocker, capture harness
    jio-service.ts      JioTV OTP, catalogue, playback, DRM and EPG calls
    media-relay.ts      loopback proxy for manifests, segments and licences
    secure-store.ts     safeStorage-encrypted token persistence
    window-state.ts     remembered bounds and maximised state
  preload/index.ts      context-isolated, typed bridge (window.api)
  shared/               IPC channel names and shared models
  renderer/             React application
    src/pages/          Home, Category, Guide, Favorites, Settings, Player
    src/components/     layout, home, player, guide, auth, settings, ui
    src/store/          zustand stores (catalogue, auth, player, settings, UI)
    src/hooks/          useHlsPlayer, useNow, useIdle, useDebounce, useRowScroll
    src/mocks/          deterministic demo catalogue and EPG
```

- **Security** — `contextIsolation: true`, `nodeIntegration: false`,
  `webSecurity: true`. The renderer only receives a session object; the main
  process owns Jio tokens. A CSP is injected for production builds only, since
  Vite's dev preamble needs inline scripts.
- **Playback** — Jio manifests are rewritten to a random loopback port in the
  main process. hls.js or shaka then load them from `http://127.0.0.1:*` without
  disabling web security or hitting CORS wall.
- **Storage** — preferences, favourites and recents live in `localStorage`
  through zustand's persist middleware. Credentials are stored separately in
  the main process with `safeStorage` (DPAPI on Windows).

## Widevine and DRM

Stock Electron does not ship a Widevine CDM. Streams that require one fail with
a clear error instead of a broken player; HLS demo streams and non-DRM Jio
channels play normally. To support Widevine you would need a CDM-enabled
Electron build and a licence agreement appropriate for your use.

## Visual verification

The main process includes an opt-in capture harness for checking real builds
without a browser tool:

```powershell
$env:STREAMDECK_CAPTURE="/,/guide,/settings,/watch/ch-101"
$env:STREAMDECK_CAPTURE_DIR="$env:TEMP\streamdeck-capture"
pnpm exec electron out/main/index.js --user-data-dir="$env:TEMP\streamdeck-capture-profile"
```

Each route is cold-loaded, screenshotted into the capture directory and logged
to `streamdeck-capture.log`. Append `@<javascript>` to an entry to open an
overlay, for example:

```powershell
$env:STREAMDECK_CAPTURE="/@document.querySelector('button[aria-haspopup=menu]').click()"
```

The harness only activates when `STREAMDECK_CAPTURE` is set.

## License

MIT. Channel names, logos and streams belong to their respective owners.
