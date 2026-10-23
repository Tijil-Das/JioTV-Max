# Cast to TV Feature Guide & Architecture

JioTv Max includes a native **"Cast to TV"** system. Rather than screen mirroring or consuming HDMI cables, the app locates TVs and streaming boxes on your Wi-Fi, passes the stream URL to the receiver, and transforms your desktop into a remote control.

---

## 1. Supported Targets & Protocols

| Protocol | Compatible Receivers | Engine & Discovery |
| :--- | :--- | :--- |
| **Google Cast** | Chromecast, Google TV, Android TV, Nest Hub | `chromecast-api` (`castv2-client` over mDNS & DIAL SSDP) |
| **DLNA / UPnP** | Samsung (Tizen), LG (webOS), Sony (Bravia), Roku, Panasonic | `node-ssdp` (M-SEARCH `urn:schemas-upnp-org:device:MediaRenderer:1`) + `upnp-mediarenderer-client` |
| **AirPlay (Phase C)**| Apple TV, AirPlay 2-compatible receivers | Architecture slot prepared (`AirPlayAdapter` stub) |
| **Fallback Web Receiver**| Phones, tablets, laptops, game consoles | Local HTTP receiver at `http://<LAN-IP>:<port>/watch/<token>` with offline QR code |

---

## 2. Architecture & Security

```
┌────────────────────────────────────────────────────────┐
│               ELECTRON RENDERER (UI)                  │
│  CastButton ──► CastDialog ──► CastingOverlay          │
│               ▲                                        │
│               │ window.castApi (contextBridge)         │
└───────────────┼────────────────────────────────────────┘
                │ IPC (Validated: URLs, Volume, Ranges)
┌───────────────▼────────────────────────────────────────┐
│             ELECTRON MAIN PROCESS                      │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │                   CastManager                    │  │
│  │   • Device Registry (Dedupe & 60s TTL Expiry)    │  │
│  │   • State Machine (idle -> connecting -> ...)    │  │
│  │   • 10s Connect / 15s Playback Start Timeouts    │  │
│  │   • Channel Switch & Auto-Reconnect (2 Retries)   │  │
│  └───────┬──────────────────────────┬───────────────┘  │
│          │                          │                  │
│  ┌───────▼───────────┐      ┌───────▼───────────────┐  │
│  │  Device Adapters  │      │     StreamServer      │  │
│  │  • Chromecast     │      │  • 0.0.0.0 Free Port  │  │
│  │  • DLNA / UPnP    │      │  • CORS & Preflight   │  │
│  │  • MockAdapter    │      │  • Range 206 Support  │  │
│  │  • AirPlay Stub   │      │  • HLS URL Rewriter   │  │
│  └───────────────────┘      │  • Fallback Receiver  │  │
│                             └───────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

* **Context Isolation:** The renderer never touches Node networking or UDP/TCP sockets. All requests pass through `window.castApi`.
* **Zero Loopback Leaks:** Streams destined for TVs are never sent `127.0.0.1` or `localhost`. The `StreamServer` advertises the laptop's real active LAN IPv4 address.
* **Sensitive Query Masking:** Signed tokens (`__hdnea__`, auth tokens) in stream URLs are automatically redacted in logs and diagnostics.

---

## 3. How to Test Without Physical Hardware (Mock Mode)

Mock mode simulates discovery, connection, playback, buffering, volume changes, and errors without requiring physical TVs.

### Enabling Mock Mode
Mock mode is **automatically active in development mode** (`!app.isPackaged`) and can be explicitly forced anywhere using:
```powershell
$env:CAST_MOCK = "1"
pnpm dev
```

### Pre-Configured Test Devices
1. **Mock Living Room TV**: Connects immediately and streams normally.
2. **Mock Bedroom TV**: Simulates a slow TV connection (6-second delay) before playing.
3. **Mock Broken TV**: Simulates immediate connection failure (`ECONNREFUSED`) to test error banners and retry buttons.
4. **Mock Flaky TV**: Connects and plays smoothly, then drops connection after 20 seconds to exercise automatic reconnection logic.
5. **Mock Unsupported TV**: Simulates an unsupported format error (Code 702) to exercise decoder failure reporting.

---

## 4. Real-Protocol Testing on Local Machine

### A. Testing DLNA / UPnP with VLC
1. Open VLC Media Player.
2. Go to **Tools** -> **Preferences** -> Show Settings: **All**.
3. Under **Interface** -> **Control interfaces**, check **UPnP**.
4. Alternatively, use VLC's Renderer mode:
   * Run VLC with: `vlc --control upnp`
   * Or run **Kodi**: Go to **Settings** -> **Services** -> **UPnP / DLNA** -> Enable **"Allow remote control via UPnP"**.
5. Open JioTv Max, click the **Cast button** in the player bar.
6. The Kodi/VLC instance will appear under its friendly name. Click to cast.
> **Note on Local Multicast**: Some Windows networking configurations prevent a host from seeing its own multicast broadcasts on loopback. If discovery does not show VLC on the same machine, run a DLNA player app on an Android/iOS device connected to the same Wi-Fi (such as *BubbleUPnP* or *VLC Mobile*).

### B. Testing DLNA with Windows Media Player
1. Open Windows Media Player.
2. Click **Stream** -> **Allow remote control of my Player...**.
3. Keep Windows Media Player open in the background.
4. Open JioTv Max and click Cast. Windows Media Player will appear as a DLNA MediaRenderer.

### C. Testing Chromecast
Chromecast devices use proprietary Google Castv2 protocols over TLS. Since Google does not offer an official desktop emulator, validation on real hardware relies on a physical Chromecast, Google TV, or Android TV. In automated CI/CD and local development, the `MockAdapter` exercises the exact state machine and error paths.

---

## 5. Diagnostics & Troubleshooting

When troubleshooting casting issues in the field:
1. Open the Cast dialog and click **Help & Troubleshooting**.
2. Click **Copy diagnostics**.
3. A JSON report will be copied to your clipboard containing:
   * App version & OS build.
   * Last 50 rotating log lines from `cast.log` with query tokens masked.
   * Device model & protocol.
   * State history transition timestamps.
   * Technical error code.

### Windows Firewall Notes
* On the first run, Windows Defender Firewall will ask for network permissions. **You must allow access on Private Networks**.
* SSDP uses UDP port 1900; mDNS uses UDP port 5353. The local `StreamServer` binds to a dynamic TCP port on `0.0.0.0`.
* If your Windows network profile is set to **Public**, Windows blocks incoming SSDP and multicast traffic. Change your Wi-Fi profile to **Private** in Windows Settings -> Network & Internet.

---

## 6. Known Limitations & Roadmap

1. **DRM Streams:** Widevine DRM-protected channels (such as specific premium movie channels requiring custom CDM binaries) cannot be decrypted by standard TV default receivers without a dedicated Cast receiver app.
2. **Audio/Video Transcoding:** Broadest TV compatibility is achieved with HLS (H.264 video + AAC audio). Channels with unusual audio codecs or HEVC-only video may fail on older TVs. Adding an optional FFmpeg real-time remuxing/transcoding pipeline in a future release can transcode unsupported audio/video streams on the fly.
3. **AirPlay (Phase C):** The `AirPlayAdapter` slot is prepared in `src/main/casting/airplay-adapter.ts` for native RAOP/RTSP AirPlay support.
