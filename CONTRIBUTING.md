# Contributing to JioTv Max

Thank you for your interest in contributing to **JioTv Max**! We are building a high-performance, native desktop experience for live television on Windows, and contributions from developers, designers, and enthusiasts are warmly welcomed.

---

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for everyone. Please be respectful, inclusive, and collaborative in all interactions across issues, discussions, and pull requests.

---

## How Can I Contribute?

### 1. Reporting Bugs
- Check existing [GitHub Issues](https://github.com/Tijil-Das/JioTV-Max/issues) first to make sure your bug hasn't already been reported.
- If not, create a new issue detailing:
  - Clear summary of the bug.
  - Windows version (e.g., Windows 11 Build 22631).
  - App mode (Demo mode or Live JioTV mode).
  - Steps to reproduce.
  - Expected vs actual behavior.
  - Screenshots or console logs (press `Ctrl+Shift+I` to inspect renderer devtools if in development).

### 2. Suggesting Enhancements & Features
- Propose feature ideas by opening an issue on GitHub.
- Describe the use case and why this enhancement benefits desktop live TV viewers.

### 3. Submitting Code Contributions

#### Setting Up Your Local Environment

1. **Prerequisites**:
   - Windows 10 or 11 (64-bit).
   - Node.js 20 or higher.
   - `pnpm` (version 9 or 10):
     ```powershell
     npm install -g pnpm
     ```

2. **Fork and Clone**:
   ```powershell
   git clone https://github.com/<your-username>/JioTV-Max.git "JioTV Max"
   cd "JioTV Max/JioTV-Max-Windows"
   ```

3. **Install Dependencies**:
   ```powershell
   pnpm install
   ```

4. **Launch Dev Environment**:
   ```powershell
   # Standard development (Demo mode + HLS channels)
   pnpm dev

   # Launch with Widevine DRM support (castLabs Electron)
   pnpm dev:wv
   ```

#### Developing and Testing Changes

- **Code Style**: We use TypeScript with ESLint and Prettier standards.
- **Type Checking**: Ensure no TypeScript compiler errors:
  ```powershell
  pnpm typecheck
  ```
- **Run Unit Tests**:
  ```powershell
  pnpm test
  ```

#### Submitting a Pull Request (PR)

1. Create a descriptive branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```
2. Commit your changes with clear, concise messages adhering to Conventional Commits:
   - `feat: add volume gesture control`
   - `fix: resolve manifest parsing error for regional streams`
   - `docs: update setup instructions`
3. Push your branch to your fork and open a Pull Request against `main`.
4. Fill out the Pull Request template detailing your changes and test coverage.

---

## Key Areas for Contributions

- ⚡ **Playback Pipeline**: Enhancing HLS/DASH buffer heuristics, stream recovery on network drops, low-latency optimizations.
- 🎨 **User Interface**: Accessibility improvements, keyboard navigation, smooth transitions, and responsive adjustments for ultrawide displays.
- 📅 **EPG & Schedules**: Cache optimization, schedule parsing resilience, and rich program metadata.
- 🧪 **Test Coverage**: Adding unit and end-to-end tests for player controls, authentication states, and IPC error boundaries.

---

Thank you for helping make JioTv Max better for everyone!
