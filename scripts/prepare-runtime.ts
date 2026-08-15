/**
 * Prepare the desktop launcher's bundled runtime payload for electron-builder.
 *
 * Steps:
 *  1. `pnpm deploy` the runtime-deploy root's closure (the dsh CLI app and its
 *     whole web dependency tree, including the built frontend dist) into
 *     `dist-runtime/runtime/` using the same legacy hoisted flags the SDK
 *     pipeline uses.
 *  2. Materialize any workspace package symlinks left by pnpm deploy into real
 *     directories, so the shipped payload is self-contained (no checkout
 *     back-references) and survives moving/zipping.
 *  3. Verify the CLI entry and frontend dist landed.
 *  4. Stage a portable Node runtime (node.exe + node_modules) into
 *     `dist-runtime/node/` for spawning the CLI on machines without Node.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx apps/desktop/scripts/prepare-runtime.ts [--skip-node] [--skip-deploy]
 *
 * @module dsh-desktop/prepare-runtime
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = resolve(import.meta.dirname, '..', '..', '..')
const DESKTOP = join(ROOT, 'apps', 'desktop')
const OUT = join(DESKTOP, 'dist-runtime')
// Stable directory expected by electron-builder's extraResources (from: dist-runtime/final).
const RUNTIME = join(OUT, 'final')
const NODE_DIR = join(OUT, 'node')
const DEPLOY_ROOT_PACKAGE = '@deepseek-ai/dsh-desktop-runtime'

/** Entry that must exist after deploy: the dsh CLI bin inside the closure. */
const CLI_ENTRY = join(RUNTIME, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
/** Frontend dist that must exist: served by dsh-web-app through the closure. */
const FRONTEND_INDEX = join(RUNTIME, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html')
/** Portable Node distribution (official win-x64 zip from the npmmirror mirror). */
const NODE_VERSION = process.env.DSH_DESKTOP_NODE_VERSION ?? 'v24.18.0'
const NODE_ZIP = `node-${NODE_VERSION}-win-x64.zip`
const NODE_URL = process.env.DSH_DESKTOP_NODE_MIRROR
  ?? `https://npmmirror.com/mirrors/node/${NODE_VERSION}/${NODE_ZIP}`

function pnpmBin(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

function run(label: string, command: string, args: readonly string[]): void {
  console.log(`prepare-runtime: ${label}`)
  const result = spawnSync(command, [...args], { cwd: ROOT, stdio: 'inherit', windowsHide: true })
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${String(result.status)}`)
}

/** Return the first symbolic link below a directory. */
async function findSymlink(directory: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) return path
    if (metadata.isDirectory()) {
      const nested = await findSymlink(path)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/** Replace every pnpm-deploy workspace symlink with a real copy of its target. */
async function materializeStagedLinks(): Promise<number> {
  const nodeModules = join(RUNTIME, 'node_modules')
  let count = 0
  let remaining = await findSymlink(nodeModules)
  while (remaining !== undefined) {
    const destination = remaining
    const source = await realpath(destination)
    const nestedNodeModules = join(source, 'node_modules')
    await rm(destination, { recursive: true, force: true })
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: (path) => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
    })
    count += 1
    remaining = await findSymlink(nodeModules)
  }
  return count
}

/** Stage the portable Node runtime (node.exe + node_modules) via the npmmirror mirror. */
async function stageNode(): Promise<void> {
  if (!existsSync(join(NODE_DIR, 'node.exe'))) {
    await rm(NODE_DIR, { recursive: true, force: true })
    await mkdir(NODE_DIR, { recursive: true })
    const zip = join(OUT, NODE_ZIP)
    console.log(`prepare-runtime: downloading ${NODE_URL}`)
    execFileSync('curl.exe', ['-L', '--retry', '5', '--retry-all-errors', '-o', zip, NODE_URL], { stdio: 'inherit' })
    console.log('prepare-runtime: extracting Node runtime')
    const extractDir = join(OUT, `node-extract`)
    await rm(extractDir, { recursive: true, force: true })
    await mkdir(extractDir, { recursive: true })
    execFileSync('tar.exe', ['-xf', zip, '-C', extractDir], { stdio: 'inherit' })
    const inner = join(extractDir, `node-${NODE_VERSION}-win-x64`)
    if (!existsSync(inner)) throw new Error(`prepare-runtime: unexpected Node archive layout at ${inner}`)
    await cp(inner, NODE_DIR, { recursive: true, dereference: true })
    await rm(extractDir, { recursive: true, force: true })
    await rm(zip, { force: true })
  }
  if (!existsSync(join(NODE_DIR, 'node.exe'))) {
    throw new Error('prepare-runtime: staged Node runtime is missing node.exe')
  }
}

const { values } = parseArgs({
  options: {
    'skip-deploy': { type: 'boolean', default: false },
    'skip-node': { type: 'boolean', default: false },
  },
  allowPositionals: false,
})

/** Remove a directory, retrying while Windows AV holds a transient lock. */
async function removeWithRetry(target: string, attempts = 20, delayMs = 3000): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === attempts - 1) throw error
      console.log(`prepare-runtime: ${target} locked (${String(attempt + 1)}); waiting ${delayMs}ms`)
      await new Promise((done) => setTimeout(done, delayMs))
    }
  }
}

async function main(): Promise<void> {
  if (values['skip-deploy'] !== true) {
    if (OUT === ROOT || ROOT.startsWith(OUT + sep)) {
      throw new Error('prepare-runtime: refusing to clear a directory containing the repo root')
    }
    await removeWithRetry(RUNTIME)
    await mkdir(OUT, { recursive: true })
    run('deploy runtime closure', pnpmBin(), [
      '--filter', DEPLOY_ROOT_PACKAGE,
      'deploy',
      '--legacy',
      '--prod',
      '--config.node-linker=hoisted',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=true',
      RUNTIME,
    ])
    const materialized = await materializeStagedLinks()
    console.log(`prepare-runtime: materialized ${String(materialized)} workspace symlink(s)`)
    for (const required of [CLI_ENTRY, FRONTEND_INDEX]) {
      if (!existsSync(required)) {
        throw new Error(`prepare-runtime: ${required} missing — run a full pnpm run build first so lib/ and dist/ exist.`)
      }
    }
  }
  if (values['skip-node'] !== true) {
    await stageNode()
  }
  console.log(`prepare-runtime: payload ready at ${OUT}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

export {}