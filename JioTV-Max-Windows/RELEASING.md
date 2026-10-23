# JioTv Max — Release Workflow Guide

This document is the definitive guide on how to create, test, build, and publish releases for **JioTv Max**.

---

## 🚀 Quick Release in 3 Commands

When you are ready to make a release from the `main` branch:

```bash
# 1. Ensure you have the latest code
git checkout main
git pull origin main

# 2. Bump the version (this updates package.json, commits, and creates a git tag)
cd JioTV-Max-Windows
npm version patch   # Bug fix (e.g., 1.0.0 -> 1.0.1)
# or: npm version minor  (e.g., 1.0.0 -> 1.1.0)
# or: npm version major  (e.g., 1.0.0 -> 2.0.0)
cd ..

# 3. Push the commit and the tag to GitHub
git push origin main --tags
```

*(To push only the specific release tag instead: `git push origin v1.0.1`)*

---

## ⚙️ What Happens Automatically

Pushing a `v*` tag triggers the GitHub Actions workflow at [.github/workflows/release.yml](../.github/workflows/release.yml):

1. **Environment Setup**: Spawns a clean `windows-latest` runner, configures Node 20 & pnpm 9, and restores the pnpm store cache.
2. **Version Check**: Validates that the git tag strictly matches `"version"` in `JioTV-Max-Windows/package.json`.
3. **Quality Gates**: Runs full TypeScript typechecks and unit tests.
4. **castLabs Widevine Setup**: Downloads and verifies castLabs Electron runtime for secure Widevine DASH playback.
5. **Compilation & Packaging**:
   - Compiles Vite main, preload, and React renderer bundles.
   - Embeds relative app icons from `build/` into the package `.asar`.
   - Generates the NSIS installer: `JioTv-Max-<version>-setup.exe`.
6. **Update Metadata Generation**:
   - Calculates sha512 checksums and generates `latest.yml`.
   - Generates the differential `.blockmap` file used by `electron-updater` for silent, low-bandwidth updates.
7. **Publishing**:
   - Uploads `.exe`, `.blockmap`, and `latest.yml` to GitHub Releases.

---

## 📢 Publishing the Release on GitHub

By default, `electron-builder` drafts releases so the maintainer can review release notes before pushing live:

### Option A: Via GitHub Web Interface
1. Go to your repository's [Releases page](https://github.com/Tijil-Das/JioTV-Max/releases).
2. Open the newly created draft release.
3. Review or edit the release notes.
4. Click **Publish release**.

### Option B: Via Terminal (Instant Publish)
You can publish the latest draft release directly from terminal using Node:

```bash
node -e "fetch('https://api.github.com/repos/Tijil-Das/JioTV-Max/releases').then(r=>r.json()).then(releases=>{const draft=releases.find(r=>r.draft); if(draft){fetch(draft.url,{method:'PATCH',headers:{Authorization:'token ' + process.env.GH_TOKEN,'User-Agent':'node','Content-Type':'application/json'},body:JSON.stringify({draft:false})}).then(()=>console.log('Published!'));}})"
```

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
