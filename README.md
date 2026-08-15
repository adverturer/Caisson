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

## Download

Grab the latest installer from [Releases](https://github.com/adverturer/Caisson/releases):

```
DeepSeek Harness Setup <version>.exe
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
>
> This repository holds the launcher source only — not the ~244 MB DSH runtime closure. Building the installer requires a deepseek-harness workspace to resolve the `workspace:` dependencies in [`runtime-deploy/package.json`](runtime-deploy/package.json) and to build the frontend `dist/`. The packaging scripts expect the Caisson checkout to live at `apps/desktop` inside deepseek-harness:

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git clone https://github.com/adverturer/Caisson.git apps/desktop
```

Ensure the deepseek-harness `pnpm-workspace.yaml` includes:

```yaml
packages:
  - apps/*
  - apps/desktop/runtime-deploy

overrides:
  '@electron/get': '3.1.0'   # electron-builder 26 needs ElectronDownloadCacheMode (missing in 3.0.0)

allowBuilds:
  electron: true
  electron-winstaller: true
```

Then build and package:

```powershell
corepack enable
pnpm install
pnpm run build                     # builds DSH lib/ + frontend dist/
pnpm --filter @deepseek-ai/dsh-desktop run dist
```

Output: `apps/desktop/release/DeepSeek Harness Setup <version>.exe`

The `dist` script runs: `tsc` → `pnpm deploy` of the runtime closure (symlinks materialized into real dirs) → portable Node.js staging → electron-builder (NSIS x64) → `afterPack` hook restores the root `node_modules` that electron-builder's file filter drops.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DSH_DESKTOP_PORT` | `3080` | Web port the launcher manages and opens |
| `DSH_REPO_ROOT` | derived | deepseek-harness checkout root (source mode) |
| `DSH_NODE` | `NODE` / `node` | Node executable for the DSH CLI (source mode) |
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
