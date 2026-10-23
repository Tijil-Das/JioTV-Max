# Windows 11 Snap Layouts Overlay Module

This module enables Windows 11 Snap Layouts flyout menus for frameless Electron windows (`titleBarStyle: 'hidden'`) using custom HTML caption buttons, without altering custom button visual appearance or interfering with HTML Minimize and Close buttons.

---

## Why the Overlay Exists

In Windows 11, the native DWM Snap Layouts flyout menu only appears when the top-level window receives a non-client hit-test query (`WM_NCHITTEST`) returning `HTMAXBUTTON` (value `9`) over the maximize/restore button.

In a frameless Electron window with custom HTML buttons, Chromium's rendering surface occupies the entire client area. As a result, Windows DWM never receives `HTMAXBUTTON` from the window, and no snap flyout is displayed.

Electron's built-in `titleBarOverlay` (Window Controls Overlay) is an all-or-nothing feature that creates native Windows Minimize, Maximize, and Close buttons simultaneously. Even when styled with `#00000000` (transparent), Chromium and Windows DWM paint native hover and active boxes over the HTML buttons, breaking custom button design and styling.

### The Solution: Targeted Child HWND
A lightweight, invisible native Win32 child window (`HWND`) is created and placed *exclusively* over the HTML Maximize button rectangle. 

- It responds with `HTMAXBUTTON` to `WM_NCHITTEST`.
- It performs zero drawing (`WM_ERASEBKGND` returns `1`, `WM_PAINT` is a no-op).
- It forwards non-client mouse interactions (`enter`, `leave`, `down`, `cancel`, `click`) to JavaScript via N-API `Napi::ThreadSafeFunction`.
- Minimize and Close remain 100% custom HTML buttons.

---

## Architecture & Event Flow

```
+-------------------------------------------------------------+
| Top-level BrowserWindow (HWND)                              |
|                                                             |
|   +-----------------------------------------------------+   |
|   | Chromium WebContents Render View                    |   |
|   |  - HTML Minimize button                             |   |
|   |  - HTML Maximize button (data-hover, data-pressed)  |   |
|   |  - HTML Close button                                |   |
|   +-----------------------------------------------------+   |
|                             ^                               |
|       Invisible Child HWND  | (positioned over Maximize)    |
|   +-------------------------+                           |   |
|   | WM_NCHITTEST -> HTMAXBUTTON (triggers Snap Flyout)  |   |
|   | WM_MOUSEACTIVATE -> MA_ACTIVATE                     |   |
|   | TrackMouseEvent -> enter, leave, down, cancel, click|   |
+---+-----------------------------------------------------+---+
                              |
               ThreadSafeFunction event callbacks
                              v
                  [Main: SnapController]
             /                              \
       (native click)                   (IPC state)
             v                              v
      isMaximized() ?              send('snap:state-changed')
   unmaximize : maximize                    v
                                  [Renderer: useSnapOverlay]
                                            v
                                  data-hover / data-pressed
```

1. **Geometry Synchronization (`useSnapOverlay`)**:
   - `ResizeObserver` monitors the DOM `<button>` element.
   - Integer bounds are sent across IPC (`snap:update-bounds`) **only** when bounds change (coalesced with `requestAnimationFrame`; zero per-frame polling).
   - `SnapController` converts CSS logical coordinates to physical client pixels using the display's `scaleFactor` (`cssToPhysicalRect`).
   - `SetWindowPos` updates the child window position.

2. **Mouse Interaction & Activation**:
   - Hovering triggers `WM_NCMOUSEMOVE` and `TrackMouseEvent` (`TME_NONCLIENT | TME_LEAVE`).
   - The native addon emits `"enter"`, and renderer applies `data-hover="true"`.
   - Pressing emits `"down"`, and renderer applies `data-pressed="true"`.
   - Releasing over the button emits `"click"`, and `SnapController` toggles maximize state directly in the main process.
   - Dragging outside while pressed triggers `WM_NCMOUSELEAVE`, emits `"cancel"`, and clears pressed state.
   - Clicks on an inactive window trigger `WM_MOUSEACTIVATE` (`MA_ACTIVATE`) and `SetForegroundWindow`, activating the window without stealing keyboard focus from Chromium.

3. **Fallback Mode**:
   - On Windows 10, macOS, Linux, or if the addon binary is unavailable, `SnapController` reports `{ supported: false }`.
   - The renderer automatically operates as a standard HTML button with `:hover` and `:active` CSS pseudoclasses and `onClick` handler.

---

## Debugging

To verify hit-testing in development or automated tests:
```ts
// Returns 9 (HTMAXBUTTON) if the overlay is correctly placed at screen coordinates (x, y)
const hitCode = snapController.debugHitTest(screenX, screenY);
console.log('Hit-test result:', hitCode === 9 ? 'HTMAXBUTTON' : hitCode);
```

To run the automated Windows integration test suite:
```bash
cmd.exe /c ".\node_modules\electron\dist\electron.exe test/snap/integration-snap.cjs"
```

---

## Discovered Win32 Non-Client Quirks

1. **`WS_EX_TRANSPARENT` Breaks Hit-Testing**:
   In Win32, `WS_EX_TRANSPARENT` does not mean visual transparency—it specifies mouse pass-through (click-through). Setting `WS_EX_TRANSPARENT` causes Windows to bypass the overlay window during `WM_NCHITTEST` and deliver messages to the underlying Chromium window, completely suppressing the Windows 11 Snap Layouts flyout. The overlay must use `dwExStyle = 0` and achieve visual transparency by returning `1` from `WM_ERASEBKGND` and doing empty `BeginPaint`/`EndPaint` in `WM_PAINT`.

2. **`WS_EX_NOACTIVATE` Suppresses DWM Snap Assist**:
   Windows 11 DWM checks window activation capability before anchoring the Snap Layouts flyout. Setting `WS_EX_NOACTIVATE` signals to the shell that the window refuses activation, causing DWM to ignore `HTMAXBUTTON`. Instead, window activation is cleanly handled via `WM_MOUSEACTIVATE` returning `MA_ACTIVATE` and `SetForegroundWindow` on `WM_NCLBUTTONDOWN`.

3. **Hover Detection Inside `WM_NCHITTEST`**:
   Windows DWM often intercepts non-client mouse messages when `WM_NCHITTEST` returns `HTMAXBUTTON`, meaning `WM_NCMOUSEMOVE` is not guaranteed to fire on every mouse event. Calling `TrackMouseEvent` (`TME_NONCLIENT | TME_LEAVE`) and emitting `"enter"` inside `WM_NCHITTEST` ensures immediate, reliable hover detection.

---

## Code Signing & Packaging Implications

- The native binary `snap_overlay.node` is configured with `asarUnpack: ["build/Release/snap_overlay.node"]` in `package.json` so electron-builder extracts it alongside `app.asar` under `app.asar.unpacked/`.
- **Code Signing**: When code signing is enabled in the release pipeline, any unpacked `.node` binaries must be signed with the same Authenticode certificate as the main executable (`JioTv Max.exe`), typically handled automatically by `electron-builder` or an `afterSign` hook.
