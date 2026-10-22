# Release Process

This document outlines the standard release process for **JioTv Max**. Releases are automatically built and published to GitHub Releases via GitHub Actions using `electron-builder` and `electron-updater` differential blockmaps.

> [!NOTE]
> **Platform Support**: JioTv Max uses **castLabs Widevine Electron**, which is currently configured and supported exclusively for **Windows (x64)** due to Widevine VMP binary signatures (`electron.exe.sig`). macOS and Linux builds are excluded from the release matrix.

The `version` field in `package.json` is the single source of truth (SemVer). The Git release tag must always match `v<version>`.

---

## Maintainer Release Steps

### 1. Merge Changes to `main`
Ensure all desired commits, PRs, and QA checks are merged into the `main` branch and the working directory is clean.

```bash
git checkout main
git pull origin main
```

### 2. Bump Version & Create Tag
Use `npm version` (or `pnpm version`) to bump `package.json`, commit the change, and create the corresponding `vX.Y.Z` tag automatically:

```bash
# For a bug fix release:
npm version patch

# For a feature release:
npm version minor

# For a breaking/major release:
npm version major
```

### 3. Push Commit and Tag
Push the branch and the new tag to GitHub:

```bash
git push --follow-tags
```

### 4. CI Automated Build (Windows x64)
The GitHub Actions workflow in `.github/workflows/release.yml` triggers on the `v*` tag:
- Runs on `windows-latest` using `pnpm`.
- `pnpm install` verifies the castLabs Widevine runtime and signature (`electron.exe.sig`).
- `extraFiles` bundles `JioTv Max.exe.sig` alongside the binary before installer generation.
- Produces the NSIS installer (`JioTv-Max-<version>-setup.exe`), differential `.blockmap` file, and `latest.yml`.
- Uploads the artifacts to a new **Draft** GitHub Release.

### 5. Review & Publish
1. Open GitHub: **Releases** → find the newly drafted release corresponding to `vX.Y.Z`.
2. Review the release notes and auto-generated changelog.
3. Click **Publish release**.

> [!IMPORTANT]
> The auto-updater only checks and downloads **published**, **non-prerelease** releases. While a release is in draft, existing client installations will not see it. Once published, active clients will detect and silently download differential updates within ~20 minutes.

### 6. Pre-release Tags
Pre-release tags like `v1.5.0-beta.1` or releases marked as "Pre-release" on GitHub are intentionally ignored by the auto-updater (`allowPrerelease = false`).

### 7. Release Asset Integrity
Never delete or replace assets in a published release. The `.blockmap` file and installer sha512 checksums must remain identical for clients to perform reliable differential downloads.
