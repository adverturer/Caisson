# Caisson

English | [简体中文](README.zh-CN.md)

> An unofficial Windows desktop launcher and system-tray shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> [!IMPORTANT]
> Caisson is an independent community project and is not an official DeepSeek product.

## Overview

Caisson wraps the DeepSeek Harness web interface in a native Electron window and manages the local `dsh web` service behind it. On launch it probes `http://127.0.0.1:3080`: if a server is already running there, it simply attaches; otherwise it starts the bundled DSH runtime with the bundled Node.js executable — no system-wide Node.js install required.

The prebuilt Windows installer is fully self-contained (Electron shell + portable Node.js + the DSH production dependency closure + the compiled frontend).

| What do you want to do? | What you need |
| --- | --- |
| **Use Caisson** | Only the installer from [Releases](https://github.com/adverturer/Caisson/releases) — install and double-click. No Node.js, no pnpm, no deepseek-harness checkout. |
| **Rebuild the installer from source** | A deepseek-harness workspace + Node.js 24 + pnpm 11 — see [Build the standalone installer](#build-the-standalone-installer). That section is for developers only. |

## Features

- Native Electron `BrowserWindow` hosting the DSH web GUI
- Attaches to an already-running `dsh web` instead of spawning a duplicate
- Starts the bundled `dsh web` automatically when no server answers
- Windows system-tray menu: open main window · restart service · launch at login · quit
- Close-to-tray: closing the window hides it instead of quitting
- Single-instance lock — a second launch focuses the existing window
- Kills the whole spawned child process tree on quit
- Opens external links in the default browser
- Loopback-only server (`127.0.0.1`), never exposed to the LAN
- Automatically installs the bundled `dshmarket` plugin on first launch
- Adds the bundled `dsh` CLI directory to the current user's PATH during installation
- Supports workspace-free conversations with managed per-task directories
- Permanently deletes sessions from the conversation menu after confirmation

## Download

Grab the latest installer from [Releases](https://github.com/adverturer/Caisson/releases):

```
Caisson Setup <version>.exe
```

Requirements: Windows 10/11 x64. No Node.js, pnpm, or deepseek-harness checkout needed — everything ships inside the installer.

> [!NOTE]
> The preview build is not code-signed, so Windows SmartScreen may warn about an "unknown publisher". If the file came from this repo's Releases, choose **More info → Run anyway**. A signing certificate is on the roadmap for wider distribution.

### First run

1. Install and launch Caisson.
2. The local DSH web service starts and the main window opens automatically.
3. Configure your own model provider and API key in the DSH settings — credentials are **not** bundled with the installer.
4. Closing the window keeps the app in the tray; use **Quit** in the tray menu to stop it completely.

## How it works

```
launch
  └─ probe http://127.0.0.1:3080
       ├─ server up   → attach (no child process)
       └─ server down → spawn bundled node.exe + bundled dsh web
                          └─ window loads once the server is ready
```

Packaged layout (inside the installed app):

```
resources/
├── node/node.exe                              # portable Node.js
├── runtime/node_modules/@deepseek-ai/dsh/...  # DSH runtime closure
└── tray-icon.png
```

## Run from source

Prerequisites: Node.js 24.x, pnpm 11.x, and either a running `dsh web` on port 3080 or a deepseek-harness checkout.

```powershell
pnpm install
pnpm run build
pnpm start                          # attach mode: uses an existing 127.0.0.1:3080

# spawn mode: point the launcher at a deepseek-harness checkout
$env:DSH_REPO_ROOT = "D:\path\to\deepseek-harness"
pnpm start
```

## Build the standalone installer

> [!NOTE]
> **Developers only.** If you just want to *use* Caisson, skip this section — download the prebuilt installer from [Releases](https://github.com/adverturer/Caisson/releases) and you are done; nothing else is required.

This repository holds the launcher source only — not the ~250 MB DSH runtime closure. Release builds use a prepared DSH runtime closure containing the Caisson feature set. The launcher also bootstraps the `dshmarket` plugin and exposes the bundled CLI after installation.

### Prerequisites

1. A portable Node.js runtime staged at `dist-runtime/node/node.exe` (used as the bundled Node). Download from [npmmirror](https://npmmirror.com/mirrors/node/v24.18.0/node-v24.18.0-win-x64.zip) and extract into `dist-runtime/node/`.
2. A prepared DSH runtime closure containing `package.json`, `node_modules`, and the compiled Web frontend. Set its path through `DSH_DESKTOP_RUNTIME_SOURCE`, or stage it at `dist-runtime/final`.
3. Electron 33 installed at `node_modules/electron/dist` (the `electronDist` config points here).

### Package

```powershell
npm install
npx tsc -p tsconfig.json
npx electron-builder --win
```

Output: `release-0.1.3/Caisson Setup 0.1.3.exe`

The `afterPack` hook (`scripts/after-pack.cjs`) copies the prepared closure into `resources/runtime/`, restoring the root `node_modules` that electron-builder's file filter drops.

Set `DSH_DESKTOP_RUNTIME_SOURCE` to the prepared runtime closure before packaging. When it is omitted, `afterPack` uses `dist-runtime/final`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DSH_DESKTOP_PORT` | `3080` | Web port the launcher manages and opens |
| `DSH_REPO_ROOT` | derived | deepseek-harness checkout root (source mode) |
| `DSH_NODE` | `NODE` / `node` | Node executable for the DSH CLI (source mode) |
| `DSH_DESKTOP_RUNTIME_SOURCE` | `dist-runtime/final` | Prepared DSH runtime closure copied into packaged builds |
| `DSH_DESKTOP_NODE_VERSION` | `v24.18.0` | Node.js version bundled at package time |
| `DSH_DESKTOP_NODE_MIRROR` | npmmirror | Custom Node.js download mirror |

## Repository layout

```
├── src/main.ts                  # Electron main process
├── resources/                   # app + tray icons
├── runtime-deploy/package.json  # manifest of the bundled DSH runtime closure
├── scripts/
│   ├── prepare-runtime.ts       # deploy closure + stage portable Node.js
│   ├── after-pack.cjs           # restore full closure into the package
│   ├── find-missing-peers.mjs   # audit the closure for missing peers
│   └── gen-icon.ps1             # regenerate icon assets
├── package.json                 # electron-builder config
└── tsconfig.json
```

## Roadmap

- [ ] Windows code signing
- [ ] Auto-update
- [ ] Service log / error page in the shell
- [ ] Port-conflict recovery UI
- [ ] Windows arm64 build
- [ ] CI packaging + automated GitHub Releases

## Security & privacy

- The managed web service binds to `127.0.0.1` only — `0.0.0.0` is deliberately rejected.
- Model API keys live in each user's local DSH config; nothing is embedded in the installer.
- Only download installers from this repository's Releases page.

## Upstream & license

Caisson is built on top of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness); the upstream project and its packages keep their own copyrights and licenses.

The Caisson launcher source is released under the [MIT License](LICENSE).
