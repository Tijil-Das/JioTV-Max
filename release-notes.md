## What's Changed in v1.1.1 🚀

### 🌟 Native Windows 11 Snap Layouts Integration
- **DWM Snap Assist Overlay**: Fixed custom titlebar behavior where the Windows 11 Snap Layout flyout menu failed to appear when hovering over the Maximize button.
- **Native C++ Subclassing**: Integrated a native Windows overlay (`snap_overlay.node`) intercepting Win32 `WM_NCHITTEST` messages and returning `HTMAXBUTTON`, seamlessly bridging borderless Electron titlebar buttons with Windows 11's Desktop Window Manager (DWM).
- **Packaging Pipeline**: Updated build packaging to bundle and align native binary dependencies across production portable and installer distributions.

---

### ⚡ Streaming, Live DVR & Audio Engine Fixes
- **DASH Live Clock Synchronization**: Configured Shaka Player with zero-drift live synchronization (`ignoreSuggestedPresentationDelay`, `defaultPresentationDelay = 3.5s`, `autoCorrectDrift`). Bypasses upstream 30–60s artificial presentation delays and synchronizes playback directly to the real broadcast live edge.
- **Human-Centric 70-Second Live DVR Threshold**:
  - **Short Pauses (< 70 seconds)**: Resumes right from the paused timeshift point without jumping ahead, preserving interrupted moments.
  - **Extended Pauses (≥ 70 seconds)**: Intelligently snaps forward to the live broadcast clock with fresh signed CDN tokens to prevent buffer starvation and stale key errors.
- **High-Fidelity Audio Preservation on Resume**:
  - Fixed a critical bug where resuming after an extended pause caused audio to cut out or downgrade to 64 kbps low-quality HE-AAC.
  - Permanently locks audio selection to the highest available bitrate (≥ 85% max audio bandwidth / 128 kbps AAC-LC / Dolby).
  - Eliminated disruptive audio language re-selections on resumption that triggered MediaSource audio decoder stalls and codec mismatches.
  - Expanded Widevine CDM profiles to probe both `mp4a.40.2` (AAC-LC) and `mp4a.40.5` (HE-AACv1).
- **Stale Clock Protection in Media Relay**: Invalidates cached CDN publish times on stream transitions and enforces a 30-second staleness cutoff to prevent false clock extrapolation.

---

### 🎨 Live DVR Seekbar & Player UI Refinements
- **Unenclosed Negative Timecode**: Redesigned the behind-live time counter on the seek bar to render as clean, tabular text (`-00:33`) without box/border enclosures.
- **Enlarged "Go Live" Button**: Upgraded button dimensions (35px height, 16px horizontal padding) with a sleek dark zinc finish, subtle borders, glowing status dot, and responsive hover transitions.

---

### 🌐 Official Website — Full In-Browser App Preview & Showcase
- **Complete App Preview Embedded**: Embedded a responsive web build of JioTV Max directly into the official website, allowing visitors to test drive the desktop experience directly inside the browser.
- **Interactive Multi-Tab Showcase**:
  - **Channel Catalogue**: Browse 1,000+ live TV channels with category filtering, language selection, and search.
  - **Live Player**: Test drive live streaming controls, volume sliders, DVR seekbar, and quality selectors.
  - **Miniplayer Experience**: Simulated Windows 11 desktop showing the floating, draggable Picture-in-Picture window overlaid on an authentic VS Code workspace.
- **Auto-Switching Showcase Carousel**: Automated tab rotation every 5 seconds that smoothly pauses as soon as the user interacts.
- **Windows 11 Desktop Fidelity**: Built a replica Windows 11 desktop environment featuring centered taskbar icons (Start, Search, Task View, Widgets, File Explorer, VS Code, Chrome, JioTV Max) and realistic titlebars.
- **Iframe Sandbox Resilience**: Integrated safe local storage fallbacks to prevent security crashes within restricted iframe sandboxes.

---

*For issues or feature requests, visit [JioTV-Max Issues](https://github.com/Tijil-Das/JioTV-Max/issues).*
