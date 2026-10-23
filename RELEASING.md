# JioTv Max — Release Workflow Guide

This guide describes how to trigger and publish official releases for **JioTv Max**.

Releases are built automatically by GitHub Actions on `windows-latest` using `electron-builder` and published directly to GitHub Releases.

---

## Quick 3-Step Release Process

### 1. Ensure `main` is up to date and clean
```bash
git checkout main
git pull origin main
```

### 2. Bump version in `package.json`
The version in `JioTV-Max-Windows/package.json` is the single source of truth (SemVer). The Git tag must match `v<version>`.

```bash
# Inside JioTV-Max-Windows (or edit package.json directly):
cd JioTV-Max-Windows
npm version patch   # For bug fixes (e.g. 1.0.0 -> 1.0.1)
# or: npm version minor  (e.g. 1.0.0 -> 1.1.0)
# or: npm version major  (e.g. 1.0.0 -> 2.0.0)
cd ..
```

### 3. Push commit and tag to GitHub
```bash
git push origin main
git push --tags
```
*(Or push a specific tag: `git push origin v1.0.1`)*

---

## What Happens Next (Automated via GitHub Actions)

When a tag starting with `v*` (e.g., `v1.0.0`) is pushed, [.github/workflows/release.yml](.github/workflows/release.yml) runs:

1. **Environment Setup**: Installs Node 20 & pnpm 9, caching dependencies.
2. **Tag Validation**: Ensures Git tag matches `"version"` in `JioTV-Max-Windows/package.json`.
3. **Quality Gates**: Runs full TypeScript typechecks and unit tests.
4. **Binary & Asset Bundling**:
   - Downloads/validates castLabs Widevine Electron.
   - Bundles all renderer and main processes, embedding relative app icons from `build/`.
   - Packages `JioTv-Max-<version>-setup.exe` via NSIS.
5. **Update Metadata Generation**:
   - Generates differential `.blockmap` file.
   - Generates `latest.yml` manifest with sha512 checksums and file sizes.
6. **Publishing**:
   - Uploads `.exe`, `.blockmap`, and `latest.yml` to the GitHub Release.

---

## Important Rules & Best Practices

- **Never delete or overwrite assets on a published release**:
  The auto-updater relies on exact sha512 hashes in `latest.yml`. Deleting or replacing `.blockmap` or `.exe` will break silent differential updates for users.
- **Always keep icon and logo paths relative**:
  Never hardcode drive letters (`C:\`, `T:\`). Window icons are loaded dynamically via `getAppIconPath()`, and channel logos are proxied via loopback relay or relative bundles.
- **AppUserModelId**:
  Always ensure `app.setAppUserModelId('tv.jiotvmax.app')` matches `"appId": "tv.jiotvmax.app"` in `package.json` so Windows taskbar shortcuts preserve the app icon.
