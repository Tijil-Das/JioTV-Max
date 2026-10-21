# StreamDeck TV — agent handoff

> Paste this file into a new agent session and ask it to continue from the
> **Next steps** section. Everything below reflects the repository state at
> commit `ed85c98` plus the uncommitted polish described at the end.

## Mission

Build a production-ready Windows desktop live-TV app called **StreamDeck TV**
(Electron + React 18 + TypeScript + Vite) for JioTV. The UI must feel like a
premium cinema product, not a dashboard:

- near-black `#050507` canvas, glassmorphism, accent violet `#7C5CFF` and cyan
  `#22D3EE`, Inter + Plus Jakarta Sans bundled locally, Framer Motion springs.
- Frameless window with a 40 px custom title bar, Windows 11 acrylic/mica when
  available, saved bounds, 1100×680 minimum, 1440×860 default, F11 / Esc
  fullscreen, `powerSaveBlocker` while the player is open.
- Collapsible icon sidebar (76 → 220 px on hover) with Home, Sports, News,
  Movies, My List, Guide, Settings; top bar with scroll-reactive glass, wide
  search (Ctrl+K), avatar menu.
- Home: five-slide auto-rotating hero (8 s), category tiles, Continue watching,
  Live right now, per-category shelves. Channel cards with LIVE pulse, logo
  monogram, mini EPG, progress, hover glow + play overlay.
- Guide: 24 h time grid, channel column fixed, ruler owns horizontal scrolling,
  virtualised rows, day navigation, category filters, jump-to-now, deep links
  (`/guide?channel=ch-101`).
- Player: HLS via hls.js, DASH + Widevine via lazily imported shaka-player,
  quality menu (default 1080p), channel zapping (↑↓), volume (←→), M/F/C/Q/P/?
  shortcuts, auto-hiding controls, buffering / retry / error states, PiP,
  fullscreen, parental PIN gate, channel drawer, live timeline.
- Auth: phone → OTP modal (demo code `123456`), 6-box OTP, resend countdown,
  shake validation, success animation, demo/JioTV switch. Tokens are encrypted
  in the Electron main process with `safeStorage`; the renderer only receives a
  session/user object. Never log OTPs or tokens.
- Settings: playback quality/language/autoplay, account mode, appearance and
  motion, parental PIN, data actions (clear favourites/recents), shortcuts,
  about. Supports a Demo mode so everything works offline.

## Environment and commands (important)

- Windows host, PowerShell 7. Working directory: `T:\Coding\JioTV Proxy`.
- pnpm 12; central store `T:\DevLibs\pnpm-store`; hoisted node_modules.
  `.npmrc` also points `electron_config_cache` at `T:\DevLibs\electron-cache`.
- Run package scripts through cmd: `cmd /c "pnpm <script>"`.
- `pnpm dev` runs electron-vite (main + preload + renderer, HMR).
- `pnpm dev:web` runs only the renderer at http://localhost:5173.
- `pnpm typecheck` runs both tsconfigs; `pnpm test` runs 8 vitest cases.
- `pnpm build` produces `out/` and injects the production CSP.
- `pnpm run pack:dir` builds an unpacked app at `release/win-unpacked` with
  builder/electron caches on T:. **Do not name an npm script `pack`** — it
  collides with pnpm's built-in `pack` command.
- `pnpm dist` builds the NSIS installer at
  `release/StreamDeck-TV-<version>-setup.exe`.
- Reference JioTV-Go source: `C:\Users\tijil\AppData\Local\Temp\jiotv_go_src\jiotv_go-main`.

## Architecture

- `src/main/index.ts` — BrowserWindow, acrylic/mica fallback, window state,
  fullscreen events, powerSaveBlocker, IPC registration, external links,
  production CSP warning suppression in dev, and the screenshot harness.
- `src/main/jio-service.ts` — real Jio endpoints: `loginotp/send`,
  `loginotp/verify`, `refreshtoken`, channel list v3.1, playback v1.1,
  `getepg` v1.3, DRM license headers. Device info and headers mirror
  `jiotv_go`. Tokens stay in main; failures degrade to demo data.
- `src/main/media-relay.ts` — loopback HTTP relay for manifests, segments and
  Widevine licences. This keeps `webSecurity: true` and avoids CORS and
  custom-header problems in `<video>`/hls.js/shaka.
- `src/main/secure-store.ts` — async safeStorage API (`isAsyncEncryptionAvailable`,
  `encryptStringAsync`, `decryptStringAsync`) with sync fallback. Never writes
  plaintext if the OS keychain is unavailable.
- `src/preload/index.ts` + `src/shared/ipc.ts` — typed, context-isolated bridge
  (`window.api`), no Node access in the renderer.
- `src/shared/types.ts` — canonical `Channel`, `Program`, `StreamInfo`,
  `AuthSession`, `StreamDeckApi`, `Result`, `AppInfo`.
- Renderer aliases: `@/*` → `src/renderer/src/*`, `@shared/*` → `src/shared/*`.

### Key renderer files

- `App.tsx` — routes (`/`, `/guide`, `/category/:category`, `/favorites`,
  `/settings`, `/watch/:channelId`), catalogue/auth bootstrap, offline toasts,
  document title, `MotionConfig` reduced motion, F11 browser fallback.
- `pages/PlayerPage.tsx` — largest surface; stream resolution, engine sync,
  keyboard map, quality pinning, parental gate, PiP, fullscreen, recents.
- `hooks/useHlsPlayer.ts` — returns
  `{ videoRef, levels, activeLevel, setLevel, buffering, reconnecting, error,
  retry, ready, engine }`; hls.js with fatal-error retries; dynamic shaka load
  with `.default ?? module` interop.
- `components/guide/GuideGrid.tsx` — virtualised EPG. **Horizontal scroll sync
  is imperative**: the ruler's scroll handler sets `--guide-x` on the body, and
  rows / now-line use `translateX(var(--guide-x))`. This avoids rAF throttling
  in occluded windows. Keep it imperative.
- `stores/` — zustand; catalogue/EPG/favourites/recents, auth, settings,
  player, UI. `useChannelStore.fetchCatalogue` falls back to demo data.
- `mocks/channels.ts` / `mocks/epg.ts` — 38 demo channels and deterministic
  24 h schedules (seeded PRNG). Titles never repeat back-to-back; genre comes
  from `GENRE_BY_CATEGORY`.
- `lib/constants.ts` — `DEMO_OTP`, `DEMO_STREAMS`, `CATEGORY_META`,
  `NAV_ITEMS`, `FEATURED_CHANNEL_IDS`, `QUALITY_OPTIONS`, `LANGUAGES`.

## Verification harness (very useful)

`src/main/index.ts` contains `runCaptureHarness`, gated by env vars and only
reachable when set. It cold-loads routes with a unique `?capture=` query so
React state resets, optionally runs a JS action (`route@js`), writes a PNG per
route, logs renderer console messages, then quits. It disables background
throttling and sets always-on-top so animations run while capturing.

Example (PowerShell):

```powershell
cmd /c "pnpm build" *> $null
$env:STREAMDECK_CAPTURE="/,/guide,/settings,/watch/ch-101"
$env:STREAMDECK_CAPTURE_DIR="C:\Users\tijil\AppData\Local\Temp\streamdeck-capture"
cmd /c "pnpm exec electron out/main/index.js --user-data-dir=C:\Users\tijil\AppData\Local\Temp\streamdeck-capture-profile"
```

Overlay examples:

```powershell
# login modal
$env:STREAMDECK_CAPTURE="/@document.querySelector('button[aria-haspopup=menu]').click()"
# quality menu / drawer / shortcuts
$env:STREAMDECK_CAPTURE="/watch/ch-101@[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')=='Stream quality').click()"
$env:STREAMDECK_CAPTURE="/watch/ch-101@[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')=='Channel list').click()"
$env:STREAMDECK_CAPTURE="/watch/ch-101@[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')=='Keyboard shortcuts').click()"
```

Read `streamdeck-capture.log` and the PNGs with the read tool. A run is clean
when the log contains only `[capture]` lines (no `[renderer:error]`).

Verified visually and with zero renderer errors: home, guide, category,
favourites, settings, player, login modal, quality menu, channel drawer,
shortcuts overlay, and the packaged `release/win-unpacked` app.

## Repo state

Git initialized locally (no remote). Commits:

```
ed85c98 fix: production CSP injection, async safeStorage, guide scroll sync and player polish
843c6b6 feat(player): HLS/DASH player, channel zapping, parental gate, settings and app routing
291f4d7 feat(guide, auth, settings): virtualised EPG, OTP sign-in, preferences and parental PIN
dcac80f chore: ignore TypeScript build info
9468e18 feat/home/hero/pages
bbfda99 layout/cards/chrome
39de24f UI primitives
df3aeb3 scaffold
```

Post-`ed85c98` uncommitted changes (as of this handoff):

- `mocks/epg.ts`: `GENRE_BY_CATEGORY` (Sports / News / Film / Kids /
  Entertainment / Regional) instead of sports → "Entertainment".
- `Hero.tsx`: Up Next time column widened to 62 px and nowrap ("11:30 PM" no
  longer wraps); Open guide icon is `CalendarRange` instead of `Info`.
- `package.json`: `pack:dir` and `dist` scripts use the T: caches and pnpm.

Untracked **user asset**: `Icon-Pack/` (a `.png` TV/play icon and a
`Square/` folder of magenta music-note PNGs). Do not delete it. It is not
currently used; the app still ships the default Electron icon. Ask the user
which icon they want (or generate a branded one) before the final installer.

## Known limitations

- Stock Electron has no Widevine CDM, so real SonyLiv-strength DRM streams
  fail with a friendly error. The plumbing (manifest relay, licence proxy,
  shaka DASH) is in place.
- Real Jio APIs need network/geo/account access; Demo mode is the reliable
  path and the default.
- Channel logos are offline monogram fallbacks (no logo asset pack).
- `Icon-Pack/` is unused; the NSIS build currently shows the default icon.
- `release/` and `out/` are build output; `*.tsbuildinfo` is gitignored.

## Next steps (in order)

1. `cmd /c "pnpm typecheck"` and `pnpm test`; rebuild and re-run a home capture
   to confirm the genre and Up Next fixes.
2. Commit the uncommitted polish (`mocks/epg.ts`, `Hero.tsx`, `package.json`).
3. Add a short root `README.md` (what it is, demo OTP `123456`, dev/build/dist
   commands, T: cache note, Widevine/DRM caveat, capture harness tip).
4. App icon: ask the user whether to use `Icon-Pack/.png` (recoloured), the
   music-note set (probably not), or a generated on-brand mark. Wiring:
   electron-builder reads `build/icon.png` (1024² PNG) and converts it for
   Windows. Verify with `pnpm run pack:dir`.
5. Run `pnpm dist` and smoke-test the NSIS installer output. Electron-builder
   caches must stay on `T:\DevLibs\electron-builder-cache` and
   `T:\DevLibs\electron-cache`.
6. Inspect the long-running `pnpm dev` window/log for runtime errors (the
   background shell ID may be stale; start a fresh `pnpm dev` if needed) and
   confirm the safeStorage deprecation warning is gone.
7. Final commit. Optionally tag `v1.0.0`.

## Gotchas

- **CSP:** production CSP is injected by `electron.vite.config.ts`
  (`contentSecurityPolicy` plugin). Do **not** put it back in
  `src/renderer/index.html` — Vite's dev inline React refresh preamble is
  blocked by `script-src 'self'`. The policy allows `data:` in `media-src`
  because hls.js creates an empty `data:,WEBVTT` track.
- **safeStorage:** Electron 45 deprecates the sync API. Use the async methods
  (already done in `secure-store.ts`); the listener warning should be gone.
- **Guide sync:** do not reintroduce `requestAnimationFrame` state updates for
  scroll; occluded windows throttle rAF and rows desync from the ruler.
- **Capture harness:** `loadFile(path, { hash })` with the same path is treated
  as a same-document navigation and does not reset React stores; the unique
  `?capture=` query in the harness is required.
- **Title bar:** reserves 142 px on the right for Windows caption buttons
  (`titleBarOverlay`); sidebar z-40, top bar z-30, modal z-100, toasts z-120.
- **Window chrome:** Sidebar/TopBar/footer unmount on `/watch`; the title bar
  fades when player controls hide.
- **Demo OTP:** any valid Indian mobile (starts 6–9) + `123456`.
- **Do not log** OTPs, tokens, or full phone numbers.
