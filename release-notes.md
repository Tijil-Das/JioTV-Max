## What's Changed in v1.0.2 🚀

### 🔑 Session & Update Stability
- **Seamless Upgrade Experience**: Fixed an issue where upgrading users were prompted with onboarding and sign-in dialogs even though their JioTV session was already authenticated and playing video in the background. Upgrading and returning users now bypass onboarding and login popups automatically.
- **Onboarding Modal Safeguards**: Hardened first-run onboarding to automatically detect existing sessions and never trigger redundant login prompts.

### 🎨 Visual & UI Polish
- **Dynamic Hero Video Contrast**: Enhanced the Home featured channel preview by darkening idle video brightness, delivering a dramatic and crisp brightening transition on hover.
- **Website "Show Why?" Technical Breakdown**: Added an interactive technical deep-dive modal to the official website explaining the exact reasons emulators are restricted to low-quality streams (Widevine L1 vs L3 hardware TEE, Play Integrity attestation, and MediaCodec overhead).
- **Website Interaction Guards**: Enforced global non-selectable text styling, prevented image dragging, and refined default cursor handling across the landing site.

### ⚙️ Automation & Release Pipeline
- **Automated Differential Blockmaps**: Hardened the GitHub Actions release workflow to guarantee `.blockmap` differential update assets are published with every release.
- **Centralized Release CLI (`updater-cli`)**: Introduced an automated release CLI (`release.cmd`) with real-time terminal progress streaming, persistent token storage, and post-release asset verification.

---
*For issues or feature requests, visit [JioTV-Max Issues](https://github.com/Tijil-Das/JioTV-Max/issues).*
