# acornvo

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Install
- **macOS:** download `Acornvo-<version>-arm64.dmg` (Apple Silicon) or `Acornvo-<version>-x64.dmg` (Intel) from [Releases](https://github.com/<org>/<repo>/releases). Drag Acornvo to Applications.
- **Windows:** download `Acornvo-<version>-setup.exe`. Run the installer; the app installs per-user with a desktop shortcut.
- **Linux:** download `Acornvo-<version>.AppImage`. Run `chmod +x Acornvo-*.AppImage` and double-click or run from terminal.

## Update
Acornvo checks for updates 60 seconds after launch and every 4 hours thereafter. When a new version is downloaded, a banner appears at the top of the window -- click **Install Now** to relaunch into the new version. Auto-check can be disabled in **Settings > About**.

## Troubleshoot
- **Logs:** `Settings > Observability > Export Diagnostic Bundle` produces a redacted zip in your Downloads folder.
- **Crashes:** if the app detects an unhandled crash from the previous run, a banner offers **View Logs / Export Diagnostic / Ignore**.
- **Reset:** delete `<userData>/logs/` to clear logs.

## Signing certificates
- **macOS:** requires `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `MAC_CERT_P12`, `MAC_CERT_PASSWORD` secrets.
- **Windows:** requires `WIN_CERT_PFX` (base64 PFX) and `WIN_CERT_PASSWORD` for Authenticode signing.
- **Linux:** AppImage is unsigned; ship a SHA256 alongside the release.
