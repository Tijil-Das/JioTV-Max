#include <napi.h>

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  // Non-Windows stub
  return exports;
}

NODE_API_MODULE(snap_overlay, Init)
