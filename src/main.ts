/**
 * dsh desktop launcher — Electron main process.
 *
 * Responsibilities:
 *  - Probe the configured Web URL. If a server already answers there (e.g. a
 *    `dsh web` started from a terminal), attach to it and manage no child.
 *  - Otherwise spawn the dsh Web CLI (`apps/cli` entry) as a child process and
 *    own its lifecycle: respawn on request, kill its whole tree on exit.
 *  - Provide a system-tray menu (open / restart / autostart / quit), a
 *    single-instance lock, and hide-to-tray instead of quit on window close.
 *
 * @module @deepseek-ai/dsh-desktop/main
 */

import { app, BrowserWindow, Menu, nativeImage, Notification, shell, Tray } from 'electron'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

// ── layout anchors ──────────────────────────────────────────────────────────

/** This file's own directory (compiled: apps/desktop/lib). */
const HERE = __dirname

/** Default repo root: three hops up from apps/desktop/lib. */
const DEFAULT_REPO_ROOT = resolve(HERE, '..', '..', '..')

/**
 * In a packaged build, the bundled dsh runtime closure lives under
 * `process.resourcesPath/runtime` and the bundled Node under
 * `process.resourcesPath/node` (see scripts/prepare-runtime.ts + electron-builder
 * extraResources). In a source checkout we use the repo directly.
 */
function packaged(): boolean {
  return app.isPackaged
}

/** The dsh runtime root the launcher spawns the CLI from. */
function runtimeRoot(): string {
  if (packaged()) return join(process.resourcesPath, 'runtime')
  return process.env.DSH_REPO_ROOT !== undefined && process.env.DSH_REPO_ROOT !== ''
    ? resolve(process.env.DSH_REPO_ROOT)
    : DEFAULT_REPO_ROOT
}

/** Resolve the Node executable used to spawn the CLI (env override, then NODE, then PATH). */
function nodeBin(): string {
  if (packaged()) {
    const bundled = join(process.resourcesPath, 'node', 'node.exe')
    if (existsSync(bundled)) return bundled
  }
  return process.env.DSH_NODE !== undefined && process.env.DSH_NODE !== ''
    ? process.env.DSH_NODE
    : (process.env.NODE ?? 'node')
}

/** The Web URL this launcher manages. Defaults to the dsh web default port. */
function webUrl(): string {
  const port = process.env.DSH_DESKTOP_PORT ?? '3080'
  return `http://127.0.0.1:${port}`
}

/** Derived from {@link webUrl}: a URL with the same host but the given port. */
function webUrlWithPort(port: number): string {
  const url = new URL(webUrl())
  url.port = String(port)
  return url.toString()
}

// ── state ────────────────────────────────────────────────────────────────────

/** True once the window's close-to-tray dance may proceed. */
let quitting = false

/** The spawned dsh CLI child process; undefined in attach mode or before spawn. */
let serverChild: ChildProcess | undefined

/** Whether this instance spawned its own server (false = attaching to an existing one). */
let ownsServer = false

/** Current window; kept single. */
let mainWindow: BrowserWindow | undefined

/** Tray; kept for the lifetime of the app. */
let tray: Tray | undefined

/** Notification throttling: last time a notification was shown. */
let lastNotify = 0

// ── helpers ──────────────────────────────────────────────────────────────────

/** Throttled tray balloon / OS notification. */
function notify(title: string, body: string): void {
  const now = Date.now()
  if (now - lastNotify < 2000) return
  lastNotify = now
  try {
    new Notification({ title, body }).show()
  } catch {
    /* notifications unsupported in this environment */
  }
}

/** Probe whether an HTTP server already answers at the managed URL. */
async function probeReady(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { signal: controller.signal, method: 'GET' })
      return response.status < 500
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return false
  }
}

/** Kill a process tree on Windows (taskkill /T /F), graceful signal elsewhere. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } else {
    try {
      process.kill(child.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
}

/**
 * Resolve the dsh CLI launch argv. Packaged: the bundled closure's CLI entry
 * (`node_modules/@deepseek-ai/dsh/lib/bin.js` from the deploy payload). Source
 * checkout: prefer the built apps/cli/lib/bin.js entry, fall back to running
 * the TS source through tsx (repo dev layout).
 * @returns the full argv to pass to the node binary.
 */
function cliArgv(port: number): string[] {
  if (packaged()) {
    const entry = join(runtimeRoot(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    return [entry, 'web', '--port', String(port)]
  }
  const root = runtimeRoot()
  const built = join(root, 'apps', 'cli', 'lib', 'bin.js')
  if (existsSync(built)) {
    return [built, 'web', '--port', String(port)]
  }
  const src = join(root, 'apps', 'cli', 'src', 'bin.ts')
  return ['--import', 'tsx/esm', src, 'web', '--port', String(port)]
}

/** Wait until the server answers at `url`, or reject after `timeoutMs`. */
async function waitReady(url: string, timeoutMs = 60_000, pollMs = 300): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probeReady(url, 800)) return
    await new Promise((done) => setTimeout(done, pollMs))
  }
  throw new Error(`dsh web did not become ready at ${url} within ${timeoutMs}ms`)
}

// ── server lifecycle ─────────────────────────────────────────────────────────

/** Spawn the dsh Web CLI and wait for readiness. Rejects if boot fails. */
async function startServer(port: number): Promise<void> {
  const root = runtimeRoot()
  const url = webUrlWithPort(port)
  const child = spawn(nodeBin(), cliArgv(port), {
    cwd: root,
    env: { ...process.env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverChild = child
  ownsServer = true

  let bootOutput = ''
  const capture = (chunk: Buffer): void => {
    bootOutput = (bootOutput + chunk.toString()).slice(-4000)
  }
  child.stdout?.on('data', capture)
  child.stderr?.on('data', capture)
  child.on('error', (error) => {
    notify('dsh 启动失败', `无法启动 dsh web：${error.message}`)
  })
  child.on('exit', (code) => {
    if (quitting) return
    notify('dsh web 已退出', `服务进程已退出（code ${String(code)}），可从托盘重启。`)
    if (ownsServer && code !== 0) {
      // Surface the tail of the boot log once, so a port conflict etc. is visible.
      if (bootOutput.trim() !== '') {
        notify('dsh 启动输出', bootOutput.trim().split('\n').slice(-6).join('\n'))
      }
    }
    serverChild = undefined
  })

  try {
    await waitReady(url)
  } catch (error) {
    killTree(child)
    serverChild = undefined
    throw error
  }
}

/** Stop the managed server if this instance spawned it. */
async function stopServer(): Promise<void> {
  const child = serverChild
  if (child === undefined) return
  serverChild = undefined
  killTree(child)
  await new Promise((done) => setTimeout(done, 300))
}

/** (Re)start the server and point the window at it; reloads the window if already open. */
async function ensureServerAndWindow(): Promise<void> {
  const url = webUrl()
  try {
    if (await probeReady(url, 1000)) {
      // Attach mode: an external `dsh web` (or a prior detached instance) owns it.
      ownsServer = false
    } else {
      const port = new URL(url).port === '' ? 3080 : Number(new URL(url).port)
      await startServer(port)
    }
    if (mainWindow === undefined || mainWindow.isDestroyed()) {
      createWindow(url)
    } else {
      await mainWindow.loadURL(url)
    }
  } catch (error) {
    notify('dsh 启动失败', error instanceof Error ? error.message : String(error))
  }
}

// ── window ───────────────────────────────────────────────────────────────────

function createWindow(url: string): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    icon: trayIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Close hides to tray; only an explicit Quit destroys the window.
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = undefined
  })

  // Open external links in the default browser, not inside the shell window.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target)
    return { action: 'deny' }
  })

  void mainWindow.loadURL(url)
}

/** Focus or recreate the main window. */
function showMainWindow(): void {
  if (mainWindow === undefined || mainWindow.isDestroyed()) {
    void ensureServerAndWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// ── tray ─────────────────────────────────────────────────────────────────────

/** The tray/window icon as a native image; falls back to an empty image. */
function trayIcon(): Electron.NativeImage {
  const candidates = [
    // Packaged: resources live under process.resourcesPath.
    join(process.resourcesPath, 'tray-icon.png'),
    join(process.resourcesPath, 'resources', 'tray-icon.png'),
    // Source layout (compiled lib is apps/desktop/lib).
    join(HERE, '..', 'resources', 'tray-icon.png'),
    join(runtimeRoot(), 'apps', 'desktop', 'resources', 'tray-icon.png'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const image = nativeImage.createFromPath(candidate)
      if (!image.isEmpty()) return image
    }
  }
  return nativeImage.createEmpty()
}

/** Rebuild the tray context menu from current state. */
function rebuildTrayMenu(): void {
  if (tray === undefined) return
  const autostart = app.getLoginItemSettings().openAtLogin
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '打开主界面',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: '重启服务',
      click: async () => {
        await stopServer()
        await ensureServerAndWindow()
      },
    },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: autostart,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true })
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        void (async () => {
          quitting = true
          await stopServer()
          app.quit()
        })()
      },
    },
  ]))
}

function createTray(): void {
  tray = new Tray(trayIcon())
  tray.setToolTip('Caisson')
  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())
  rebuildTrayMenu()
}

// ── bundled plugins bootstrap ───────────────────────────────────────────────

/**
 * Plugins that Caisson ensures are installed into the user's private web
 * profile on first launch. Each entry is a package name resolvable from the
 * npm registry configured for the bundled dsh runtime. Idempotent: already-
 * installed plugins are left alone, so this is safe to run on every boot.
 *
 * The bundled runtime's `dsh` CLI is used to perform the install so the
 * profile layout always matches what `dsh web` later reads.
 */
const BUNDLED_PLUGINS: readonly string[] = ['dshmarket']

/**
 * The user-private web profile directory that `dsh web` loads plugins from.
 * Kept in sync with the dsh CLI's profile resolution (see @deepseek-ai/dsh).
 */
function webProfileDir(): string {
  return join(homedir(), '.dsh', 'profiles', 'web')
}

/**
 * Path to the bundled `dsh.cmd` shim inside the packaged runtime. Used to
 * drive `dsh plugin --profile web add ...` without requiring `dsh` on PATH.
 */
function bundledDshCmd(): string {
  return join(runtimeRoot(), 'node_modules', '.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
}

/**
 * Ensure every {@link BUNDLED_PLUGINS} entry is present in the user's web
 * profile. Runs synchronously before the server boots so plugins are loaded
 * on the very first launch. Failures are non-fatal — the server still boots
 * and the user can retry from a terminal.
 */
function ensureBundledPlugins(): void {
  if (!packaged()) return // only bootstrap in packaged builds; dev uses the repo directly
  const dsh = bundledDshCmd()
  if (!existsSync(dsh)) {
    console.warn(`[caisson] bundled dsh not found at ${dsh}; skipping plugin bootstrap`)
    return
  }
  const profile = webProfileDir()
  for (const name of BUNDLED_PLUGINS) {
    try {
      console.log(`[caisson] ensuring plugin ${name} in ${profile}`)
      const result = spawnSync(dsh, ['plugin', '--profile', 'web', 'add', name], {
        cwd: profile,
        windowsVerbatimArguments: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      })
      if (result.status !== 0) {
        const tail = (result.stderr?.toString() ?? result.stdout?.toString() ?? '').trim().split('\n').slice(-3).join('\n')
        console.warn(`[caisson] plugin ${name} install returned ${String(result.status)}: ${tail}`)
      }
    } catch (error) {
      console.warn(`[caisson] plugin ${name} install failed:`, error instanceof Error ? error.message : String(error))
    }
  }
}

// ── app lifecycle ────────────────────────────────────────────────────────────

// Single instance: a second launch focuses the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  void app.whenReady().then(async () => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('ai.deepseek.dsh')
    }
    createTray()
    ensureBundledPlugins()
    await ensureServerAndWindow()
  })

  app.on('window-all-closed', () => {
    // Keep running in the tray on every platform; no OS default exit.
  })

  app.on('before-quit', () => {
    quitting = true
  })

  app.on('will-quit', () => {
    const child = serverChild
    if (child !== undefined) killTree(child)
  })
}
