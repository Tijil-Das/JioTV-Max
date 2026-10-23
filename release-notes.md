## What's Changed in v1.1.0 🚀

### 🌟 New Features

- **Compact Always-on-Top Miniplayer (Picture-in-Picture)**:
  - Dedicated miniplayer mode toggleable via **`P`**, **`I`**, or the player control bar button.
  - Floating 16:9 compact window (`384×216`) anchored to the bottom-right corner of the active display with `always-on-top` screen-saver level priority.
  - Smooth multi-monitor positioning and drag-to-move window movement via direct pointer capture with clean, natural cursor styling (no 4-way move pointer).
  - Built-in Windows Snap layout suppression in miniplayer mode to prevent inadvertent window snapping while repositioning.
  - Interactive controls that appear strictly on mouse activity over the miniplayer: channel logo, channel name, pulsating live badge, frosted glass central play/pause trigger, and instant "Go Live" catch-up button.
  - Expandable hover volume level setter: reveals a sleek horizontal slider on hovering the sound icon with click/drag level adjustments, mouse-wheel scrolling, dynamic red track fill, and auto-unmute.
  - Automatic focus clearing and mouse-leave cleanup ensuring all overlays fade out cleanly when the mouse leaves the miniplayer.
  - Full window restoration preserving previous window dimensions and maximized state (`Maximize2`), plus quick close (`X`).

- **Native Windows 11 Snap Layouts Overlay**:
  - Integrated fluent Windows 11 Snap Layouts menu on hovering the maximize/restore button, persisting smoothly across window move, snap, and resize events.

---

### 🎨 UI & Layout Enhancements

- **Responsive Player Controls & Dynamic HUD Scaling**:
  - Dynamically scales player controls, seek bar, time display, skip buttons, quality menu, and window toggles proportionally to window dimensions.
  - Deep dynamic scaling for the centered volume OSD indicator card (down to 50% on compact window sizes) to prevent obscuring video playback.
  - Re-engineered video stage click-to-pause area ensuring mouse clicks accurately trigger play/pause across all video areas in windowed and custom resized views.

- **Hero Section Visual & Layout Overhaul**:
  - Continuous responsive auto-scaling for Hero featured section overlay elements (chips, channel badge, title, Watch Live button, and play/pause controls) with `ResizeObserver`.
  - Enlarged navigation skip arrows with responsive chevron sizing and restored smooth sideways push/pull hover animation bounded safely within the window frame.

- **Refined Go Live Button & DVR Live Edge Badging**:
  - Redesigned, enlarged "Go Live" button with clean typography and matching sleek grey pill styling.
  - Removed radio icon for a cleaner, modern look.
  - Formatted behind-live time counter using a clean single dash (`-00:15`) instead of double dashes.

- **Window Layout & Branding Polish**:
  - Updated app loading screen tagline to: **"Enjoy JioTV on desktop with mobile plans only"**.
  - Positioned window caption controls flush against the top-right corner with proper scrollbar track offset below the close button.

---

### ⚡ Streaming & Audio/Video Engine Optimizations

- **Smart Live Edge Auto-Catchup on Resume**:
  - Resuming playback after an extended pause (≥ 20 seconds on live streams, or ≥ 15 seconds in the hero feed) automatically snaps directly forward to the live broadcast edge rather than playing stale, expired buffer frames.

- **Audio-Locked Adaptive Bitrate (ABR)**:
  - Implemented custom `AudioLockedAbrManager` for Shaka Player ensuring the highest available audio stream fidelity is permanently preserved across video resolution adaptations (1080p → 720p → 480p).
  - Enhanced HLS audio track selection algorithm scoring tracks by bitrate, codec hierarchy (E-AC-3 / Dolby > AAC-LC > HE-AAC), and excluding audio description tracks.
  - Refined stream candidate fallback order prioritizing medium quality before auto to protect against degraded mobile transcodes with poor audio.
  - Resolved quality menu issue where adaptive mode failed to display the "Auto" label.

- **Background Performance Optimization**:
  - Minimized background throttling to eliminate buffering and dropped frames when the application window is minimized or hidden.

---
*For issues or feature requests, visit [JioTV-Max Issues](https://github.com/Tijil-Das/JioTV-Max/issues).*
