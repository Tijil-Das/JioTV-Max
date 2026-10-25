## What's Changed in v1.1.2 🚀

### 📺 Live Currently Airing Program & Auto-Refresh
- **Live Broadcast Titles on Channel Tiles**: Every channel card across Home rows, categories, and grids now displays the title of the show currently broadcasting directly beneath the channel name.
- **Live Status Indicator**: Added a signature glowing red on-air dot next to the current program title, giving immediate visual feedback for live content.
- **Automatic Show-End Transition**: Integrated an automated timer set to the exact end timestamp of the active program (`endEpoch`). When a show finishes, the card seamlessly transitions to the upcoming program and refreshes the EPG without requiring page reloads.
- **Live Info in Search**: Search result list rows now present the currently airing program alongside the channel's language, quality badge, and set-top box number.

---

### 🔍 Smart Channel Number Search
- **Direct Number Dialing**: Users can now type numbers directly into the search bar (e.g., `101`, `2506`, `1304`, `144`) to instantly find channels.
- **Prioritized Matching Engine**: Implemented smart search scoring that prioritizes exact official JioTV Set-Top Box (STB) channel numbers, followed by number prefixes, internal channel IDs, and show titles.
- **Visual Number Highlighting**: Number chips in search results reflect the official channel number for rapid identification.

---

### 🎨 Authentic Logos & Consistent Channel Numbering
- **Official Jio CDN Assets**: Removed static/retro logo overrides, ensuring channels like Eurosport HD (`Dsports_HD.png`) and Eurosport SD (`Eurosport1.png`) fetch authentic, modern broadcast artwork directly from Jio's CDN.
- **Pixel-Pure Rendering**: Retained full color integrity, gradients, and original brand typography across dark and light channel artwork in accordance with the Pixel-Pure specification.
- **Unified STB Channel Numbers**: Aligned channel number assignment across the desktop app and the web preview to prioritize official JioTV `stbChannelNumber` metadata (e.g., **2506** for Eurosport HD, **2500** for Eurosport SD, **1304** for Colors HD, **101** for DD National).

---

### 🌐 Web App Live EPG Parity
- **Public CORS EPG Integration**: Connected the web app directly to Jio's public EPG endpoint (`https://jiotv.data.cdn.jio.com/apis/v1.3/getepg/get`), streaming authentic live broadcast schedules in the browser.
- **Cross-Platform Consistency**: Eliminated mock startup schedules on the web app so that live program data, show descriptions, and broadcast timing match the desktop app with 100% parity.

---

### 📱 Official Website & Showcase Mobile Polish
- **Mobile Segmented Tabs**: Upgraded the interactive showcase navigation on small screens to a sleek, compact segmented pill design and eliminated mobile glow artifacts.
- **Audio & Playback Clean-up**: Fixed an issue where switching showcase tabs could trigger simultaneous audio streams; disabled adding to "My List" within demo previews.
- **Layout & Modal Refinements**: Centered install prompt sheets on Settings and My List pages, refined miniplayer splash screen dimensions, and optimized 640px responsive breakpoints.

---

### ⚡ Stability & Performance
- **Launch Screen & Frame Smoothing**: Fixed white screen flash at app launch by delaying window maximization until the initial renderer frame is ready-to-show, alongside critical dark styling in the base document.
- **Hero Video Cinema Polish**: Removed stale EPG backdrop placeholder to prevent broken photo icon artifacts in the hero stage.
- **Packaging & Binary Assurance**: Added automated checks for native dependencies (`ensure-ffmpeg.mjs`, `ensure-better-sqlite.mjs`) and configured `asarUnpack` for bundled binaries.
- **Zero Regressions**: 100% pass rate across all 236 unit and integration test suites, including logo decoding, smart search ranking, and DASH stream playback.

---

*For issues or feature requests, visit [JioTV-Max Issues](https://github.com/Tijil-Das/JioTV-Max/issues).*
