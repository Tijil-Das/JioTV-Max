# JioTv Max — Release Workflow Guide

This document is the definitive guide on how to create, test, build, and publish releases for **JioTv Max**.

---

## 🚀 Interactive Release with updater-cli (Recommended)

The repository includes a release CLI at `updater-cli/` with convenient root launchers (`release.cmd` / `release.sh`). It coordinates the entire release end-to-end:

```powershell
# Run the interactive release wizard from repository root:
.\release.cmd

# Check current release & GitHub Actions status:
.\release.cmd status

# Re-attach live monitoring to an ongoing workflow run:
.\release.cmd watch

# Preview the release without touching git or making API calls:
.\release.cmd --dry-run --bump patch
```

### What `updater-cli` Does Automatically:
1. **Context Inspection**: Derives owner/repo, branch, current version, tags, and GitHub token from git credentials.
2. **Interactive Bumps**: Select SemVer bump (`patch`, `minor`, `major`, `prerelease`, or custom).
3. **Release Notes Preview**: Reads `release-notes.md` and lets you preview, edit in your editor, or paste updates.
4. **Pre-flight Checks**: Confirms git installation, clean working tree, on `main` branch, up to date with origin, tag availability, and GitHub Actions workflow file.
5. **Atomic Execution**: Updates `package.json`, creates annotated tag, and pushes to origin. If push fails, automatically rolls back local changes cleanly.
6. **Live Terminal Dashboard**: Renders in-place progress bars, job status, duration, ETA, and step indicators without leaving the terminal.
7. **Release & Asset Verification**: Validates the published GitHub Release, checking the setup installer (`.exe`), differential update map (`.blockmap`), and `latest.yml`.

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
