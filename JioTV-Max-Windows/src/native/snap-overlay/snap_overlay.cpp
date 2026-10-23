#include <windows.h>
#include <windowsx.h>
#include <napi.h>
#include <mutex>
#include <unordered_map>
#include <string>

static const wchar_t* OVERLAY_WINDOW_CLASS = L"JioTvMax_SnapOverlayChildWindow";
static bool g_classRegistered = false;
static std::mutex g_stateMutex;

struct OverlayContext {
  HWND hParent = nullptr;
  HWND hChild = nullptr;
  bool isPressed = false;
  bool isHovered = false;
  Napi::ThreadSafeFunction eventCallback;
};

static std::unordered_map<HWND, OverlayContext*> g_overlayMap;

static void EmitEvent(OverlayContext* ctx, const char* eventName) {
  if (!ctx || !ctx->eventCallback) return;
  std::string name(eventName);
  ctx->eventCallback.NonBlockingCall([name](Napi::Env env, Napi::Function jsCallback) {
    Napi::HandleScope scope(env);
    jsCallback.Call({ Napi::String::New(env, name) });
  });
}

static LRESULT CALLBACK OverlayWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  OverlayContext* ctx = nullptr;
  HWND hParent = nullptr;
  {
    std::lock_guard<std::mutex> lock(g_stateMutex);
    auto it = g_overlayMap.find(hwnd);
    if (it != g_overlayMap.end()) {
      ctx = it->second;
      if (ctx) hParent = ctx->hParent;
    }
  }

  switch (msg) {
    case WM_NCHITTEST:
      return HTMAXBUTTON;

    case WM_ERASEBKGND:
      // Prevent any background painting so the underlying HTML button is visible.
      return 1;

    case WM_PAINT: {
      ValidateRect(hwnd, NULL);
      return 0;
    }

    case WM_SETCURSOR: {
      SetCursor(LoadCursorW(NULL, MAKEINTRESOURCEW(32512))); // IDC_ARROW
      return 1;
    }

    case WM_MOUSEACTIVATE: {
      // Ensure the top-level parent window is activated when clicking an inactive window's overlay,
      // without taking keyboard focus into the child overlay window.
      return MA_ACTIVATE;
    }

    case WM_NCMOUSEMOVE: {
      if (ctx && !ctx->isHovered) {
        ctx->isHovered = true;
        EmitEvent(ctx, "enter");
      }

      TRACKMOUSEEVENT tme = {};
      tme.cbSize = sizeof(tme);
      tme.dwFlags = TME_NONCLIENT | TME_LEAVE;
      tme.hwndTrack = hwnd;
      TrackMouseEvent(&tme);

      // CRITICAL FOR WINDOWS 11 SNAP LAYOUTS:
      // The snap flyout belongs to the top-level app window (hParent), not this child window.
      // Forwarding WM_NCMOUSEMOVE with wParam=HTMAXBUTTON to the parent's DefWindowProcW
      // tells DWM that the parent window's maximize button is hovered, arming the DWM flyout timer.
      if (hParent && IsWindow(hParent)) {
        return DefWindowProcW(hParent, msg, wParam, lParam);
      }
      break;
    }

    case WM_NCMOUSELEAVE: {
      if (ctx) {
        if (ctx->isPressed && GetCapture() != hwnd) {
          ctx->isPressed = false;
          EmitEvent(ctx, "cancel");
        }
        if (ctx->isHovered) {
          ctx->isHovered = false;
          EmitEvent(ctx, "leave");
        }
      }

      // Tell DWM that mouse left the parent's non-client caption area.
      if (hParent && IsWindow(hParent)) {
        return DefWindowProcW(hParent, msg, wParam, lParam);
      }
      return 0;
    }

    case WM_NCLBUTTONDOWN:
    case WM_NCLBUTTONDBLCLK: {
      if (wParam == HTMAXBUTTON && ctx) {
        if (hParent && IsWindow(hParent) && GetForegroundWindow() != hParent) {
          SetForegroundWindow(hParent);
        }
        ctx->isPressed = true;
        SetCapture(hwnd);
        EmitEvent(ctx, "down");
        return 0;
      }
      break;
    }

    case WM_MOUSEMOVE: {
      if (GetCapture() == hwnd && ctx) {
        POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
        RECT rc = {};
        GetClientRect(hwnd, &rc);
        bool inRect = PtInRect(&rc, pt);
        if (inRect != ctx->isPressed) {
          ctx->isPressed = inRect;
          EmitEvent(ctx, inRect ? "down" : "cancel");
        }
        return 0;
      }
      break;
    }

    case WM_LBUTTONUP:
    case WM_NCLBUTTONUP: {
      if (ctx) {
        bool wasPressed = ctx->isPressed;
        ctx->isPressed = false;
        if (GetCapture() == hwnd) {
          ReleaseCapture();
        }

        bool inRect = false;
        RECT rc = {};
        GetClientRect(hwnd, &rc);
        if (msg == WM_NCLBUTTONUP) {
          POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
          ScreenToClient(hwnd, &pt);
          inRect = PtInRect(&rc, pt);
        } else {
          POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
          inRect = PtInRect(&rc, pt);
        }

        if (wasPressed && inRect) {
          EmitEvent(ctx, "click");
        } else {
          EmitEvent(ctx, "cancel");
        }
        return 0;
      }
      break;
    }

    case WM_CAPTURECHANGED:
    case WM_CANCELMODE: {
      if (ctx && ctx->isPressed) {
        ctx->isPressed = false;
        EmitEvent(ctx, "cancel");
      }
      return 0;
    }

    case WM_DESTROY: {
      std::lock_guard<std::mutex> lock(g_stateMutex);
      g_overlayMap.erase(hwnd);
      return 0;
    }

    default:
      break;
  }

  return DefWindowProcW(hwnd, msg, wParam, lParam);
}

static void EnsureWindowClassRegistered() {
  if (g_classRegistered) return;
  WNDCLASSEXW wc = {};
  wc.cbSize = sizeof(wc);
  wc.style = CS_HREDRAW | CS_VREDRAW;
  wc.lpfnWndProc = OverlayWndProc;
  wc.hInstance = GetModuleHandleW(NULL);
  wc.hCursor = LoadCursorW(NULL, MAKEINTRESOURCEW(32512)); // IDC_ARROW
  wc.hbrBackground = (HBRUSH)GetStockObject(NULL_BRUSH);
  wc.lpszClassName = OVERLAY_WINDOW_CLASS;
  RegisterClassExW(&wc);
  g_classRegistered = true;
}

static Napi::Value Attach(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  try {
    if (info.Length() < 5) {
      Napi::TypeError::New(env, "attach requires (hwndBuffer, x, y, width, height, [callback])").ThrowAsJavaScriptException();
      return env.Null();
    }

    if (!info[0].IsBuffer()) {
      Napi::TypeError::New(env, "hwndBuffer must be a Buffer").ThrowAsJavaScriptException();
      return env.Null();
    }

    Napi::Buffer<uint8_t> buf = info[0].As<Napi::Buffer<uint8_t>>();
    if (buf.Length() < sizeof(HWND)) {
      Napi::Error::New(env, "Invalid HWND buffer size").ThrowAsJavaScriptException();
      return env.Null();
    }

    HWND hParent = *reinterpret_cast<HWND*>(buf.Data());
    if (!IsWindow(hParent)) {
      Napi::Error::New(env, "Invalid parent HWND").ThrowAsJavaScriptException();
      return env.Null();
    }

    int x = info[1].As<Napi::Number>().Int32Value();
    int y = info[2].As<Napi::Number>().Int32Value();
    int width = info[3].As<Napi::Number>().Int32Value();
    int height = info[4].As<Napi::Number>().Int32Value();

    EnsureWindowClassRegistered();

    // WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS: standard child window of the top-level window.
    // dwExStyle = 0: NOT WS_EX_TRANSPARENT (which ruins hit-testing) and NOT WS_EX_NOACTIVATE (which breaks DWM snap assist).
    HWND hChild = CreateWindowExW(
      0,
      OVERLAY_WINDOW_CLASS,
      L"",
      WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
      x, y, width, height,
      hParent,
      NULL,
      GetModuleHandleW(NULL),
      NULL
    );

    if (!hChild) {
      Napi::Error::New(env, "Failed to create child overlay window").ThrowAsJavaScriptException();
      return env.Null();
    }

    // Position on top of Chromium child render window
    SetWindowPos(hChild, HWND_TOP, x, y, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    BringWindowToTop(hChild);

    OverlayContext* ctx = new OverlayContext();
    ctx->hParent = hParent;
    ctx->hChild = hChild;
    ctx->isPressed = false;
    ctx->isHovered = false;

    if (info.Length() >= 6 && info[5].IsFunction()) {
      ctx->eventCallback = Napi::ThreadSafeFunction::New(
        env,
        info[5].As<Napi::Function>(),
        "SnapOverlayEventCallback",
        0,
        1
      );
    }

    {
      std::lock_guard<std::mutex> lock(g_stateMutex);
      g_overlayMap[hChild] = ctx;
    }

    return Napi::BigInt::New(env, reinterpret_cast<uint64_t>(hChild));
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  } catch (...) {
    Napi::Error::New(env, "Unknown error in attach").ThrowAsJavaScriptException();
    return env.Null();
  }
}

static Napi::Value UpdateRect(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  try {
    if (info.Length() < 5) return Napi::Boolean::New(env, false);

    bool lossless = false;
    uint64_t childVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    HWND hChild = reinterpret_cast<HWND>(childVal);
    if (!IsWindow(hChild)) return Napi::Boolean::New(env, false);

    int x = info[1].As<Napi::Number>().Int32Value();
    int y = info[2].As<Napi::Number>().Int32Value();
    int width = info[3].As<Napi::Number>().Int32Value();
    int height = info[4].As<Napi::Number>().Int32Value();

    // CRITICAL: Must NOT use SWP_NOZORDER so that HWND_TOP is honored and
    // the overlay child window is re-asserted on top of Chromium's render widget.
    SetWindowPos(hChild, HWND_TOP, x, y, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    BringWindowToTop(hChild);
    return Napi::Boolean::New(env, true);
  } catch (...) {
    return Napi::Boolean::New(env, false);
  }
}

static Napi::Value BringToTop(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  try {
    if (info.Length() < 1) return Napi::Boolean::New(env, false);

    bool lossless = false;
    uint64_t childVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    HWND hChild = reinterpret_cast<HWND>(childVal);
    if (!IsWindow(hChild)) return Napi::Boolean::New(env, false);

    SetWindowPos(hChild, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    BringWindowToTop(hChild);
    return Napi::Boolean::New(env, true);
  } catch (...) {
    return Napi::Boolean::New(env, false);
  }
}

static Napi::Value SetVisible(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  try {
    if (info.Length() < 2) return Napi::Boolean::New(env, false);

    bool lossless = false;
    uint64_t childVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    HWND hChild = reinterpret_cast<HWND>(childVal);
    if (!IsWindow(hChild)) return Napi::Boolean::New(env, false);

    bool visible = info[1].As<Napi::Boolean>().Value();
    ShowWindow(hChild, visible ? SW_SHOWNOACTIVATE : SW_HIDE);
    if (visible) {
      BringWindowToTop(hChild);
    }
    return Napi::Boolean::New(env, true);
  } catch (...) {
    return Napi::Boolean::New(env, false);
  }
}

static Napi::Value DebugHitTest(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  try {
    if (info.Length() < 3) return Napi::Number::New(env, -1);

    bool lossless = false;
    uint64_t childVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    HWND hChild = reinterpret_cast<HWND>(childVal);
    if (!IsWindow(hChild)) return Napi::Number::New(env, -1);

    int screenX = info[1].As<Napi::Number>().Int32Value();
    int screenY = info[2].As<Napi::Number>().Int32Value();

    LRESULT res = SendMessageW(hChild, WM_NCHITTEST, 0, MAKELPARAM(screenX, screenY));
    return Napi::Number::New(env, static_cast<int32_t>(res));
  } catch (...) {
    return Napi::Number::New(env, -1);
  }
}

static Napi::Value Detach(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  try {
    if (info.Length() < 1) return Napi::Boolean::New(env, false);

    bool lossless = false;
    uint64_t childVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    HWND hChild = reinterpret_cast<HWND>(childVal);

    OverlayContext* ctx = nullptr;
    {
      std::lock_guard<std::mutex> lock(g_stateMutex);
      auto it = g_overlayMap.find(hChild);
      if (it != g_overlayMap.end()) {
        ctx = it->second;
        g_overlayMap.erase(it);
      }
    }

    if (ctx) {
      if (ctx->eventCallback) {
        ctx->eventCallback.Release();
      }
      delete ctx;
    }

    if (IsWindow(hChild)) {
      DestroyWindow(hChild);
    }

    return Napi::Boolean::New(env, true);
  } catch (...) {
    return Napi::Boolean::New(env, false);
  }
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("attach", Napi::Function::New(env, Attach));
  exports.Set("updateRect", Napi::Function::New(env, UpdateRect));
  exports.Set("bringToTop", Napi::Function::New(env, BringToTop));
  exports.Set("setVisible", Napi::Function::New(env, SetVisible));
  exports.Set("debugHitTest", Napi::Function::New(env, DebugHitTest));
  exports.Set("detach", Napi::Function::New(env, Detach));
  return exports;
}

NODE_API_MODULE(snap_overlay, Init)
