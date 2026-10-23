# JioTv Max — Release Workflow Guide

This document is the definitive guide on how to create, test, build, and publish releases for **JioTv Max**.

---

## 🚀 Interactive Release with updater-cli (Recommended)

The repository includes a centralized release CLI at `updater-cli/` with convenient root launchers (`release.cmd` / `release.sh`). When you trigger a release, the CLI runs the **entire pipeline end-to-end automatically**—progress monitoring and delta blockmaps are not separate opt-in tasks, they are executed as part of the release itself:

```powershell
# Run the automated release wizard from repository root:
.\release.cmd

# Or check release fleet status & download health:
.\release.cmd status

# Or preview the release flow without making git changes:
.\release.cmd --dry-run --bump patch
```

### What Happens Automatically During a Release:
1. **Local Persistent Auth**: Uses your GitHub token stored locally in `~/.jiotv-max-updater.json` (or git credentials). Prompts only once per machine.
2. **Context Inspection & Pre-flight Checks**: Validates clean working tree, branch, tag availability, and GitHub Actions workflow file.
3. **Interactive SemVer Bump**: Choose version bump (`patch`, `minor`, `major`, or custom) with release notes preview.
4. **Atomic Git Commit & Tag**: Bumps `JioTV-Max-Windows/package.json`, creates annotated tag, and pushes to `origin`.
5. **Live Progress Dashboard (Automatic)**: The CLI **automatically streams the live GitHub Actions build progress in your terminal**—showing live progress bars, job states, elapsed time, and ETA without requiring any manual command or opt-in.
6. **Delta Update Blockmap Guarantee (Automatic)**: Once the build finishes, the CLI verifies all published assets (`.exe`, `latest.yml`, `.blockmap`). If the delta blockmap is missing, it auto-generates and uploads it immediately.
7. **Release Verification**: Confirms the update is live on GitHub CDN and ready for installed app clients to receive delta updates.

---

## ⚙️ What Happens Automatically on GitHub Actions

Pushing a `v*` tag triggers the GitHub Actions workflow at [.github/workflows/release.yml](.github/workflows/release.yml):

1. **Environment Setup**: Spawns a clean `windows-latest` runner, configures Node 20 & pnpm 9, and restores pnpm store caches.
2. **Version Check**: Validates that the git tag strictly matches `"version"` in `JioTV-Max-Windows/package.json`.
3. **Quality Gates**: Runs full TypeScript typechecks and unit tests.
4. **castLabs Widevine Setup**: Downloads and verifies castLabs Electron runtime for secure Widevine DASH playback.
5. **Compilation & Packaging**:
   - Compiles Vite main, preload, and React renderer bundles.
   - Embeds relative app icons from `build/` into the package `.asar`.
   - Generates the NSIS installer: `JioTv-Max-<version>-setup.exe`.
6. **Update Metadata Generation**:
   - Calculates sha512 checksums and generates `latest.yml`.
   - Generates the differential `.blockmap` file used by `electron-updater` for silent, low-bandwidth delta updates.
7. **Publishing**:
   - Publishes `.exe`, `.blockmap`, and `latest.yml` to GitHub Releases.
   - Automatically synchronizes release notes from `release-notes.md`.

---

## 🔗 Direct Download URLs for Users and the Website

Once published, binaries can be downloaded directly from GitHub's CDN without redirecting to release pages:

- **Latest Setup Installer**:
  `https://github.com/Tijil-Das/JioTV-Max/releases/latest/download/JioTv-Max-1.0.0-setup.exe`
- **Specific Version**:
  `https://github.com/Tijil-Das/JioTV-Max/releases/download/v1.0.0/JioTv-Max-1.0.0-setup.exe`
- **Auto-Update Manifest**:
  `https://github.com/Tijil-Das/JioTV-Max/releases/latest/download/latest.yml`

The website in `/Website` automatically detects the user's OS and streams the latest binary download directly via browser download managers.

---

## ⚠️ Important Rules for Maintainers

1. **Never delete or overwrite assets on a published release**:
   The auto-updater relies on exact sha512 hashes in `latest.yml`. Deleting or replacing `.blockmap` or `.exe` will break silent updates for existing users.
2. **Always keep icon and logo paths relative**:
   Never hardcode drive letters (`C:\`, `T:\`). Window icons are loaded dynamically via `getAppIconPath()`, and channel logos are proxied via loopback relay or relative bundles.
3. **AppUserModelId**:
   Always ensure `app.setAppUserModelId('tv.jiotvmax.app')` in `src/main/index.ts` matches `"appId": "tv.jiotvmax.app"` in `package.json` so Windows taskbar shortcuts preserve the app icon.
