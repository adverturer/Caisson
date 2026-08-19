/**
 * electron-builder afterPack hook.
 *
 * electron-builder's file filter hard-excludes a root `node_modules` directory
 * from extraResources (util/filter.js: "filter the root node_modules"), so a
 * packaged dsh runtime closure would silently lose its node_modules tree. This
 * hook copies the prepared DSH runtime closure (package.json + node_modules)
 * into the unpacked app's resources/runtime after packaging, restoring what
 * the filter dropped. Runs for every produced target (win-unpacked / nsis
 * both).
 *
 * Set DSH_DESKTOP_RUNTIME_SOURCE to package a prepared runtime outside this
 * repository. Otherwise dist-runtime/final is used.
 *
 * @type {import('electron-builder').AfterPackHook}
 */
const { access, cp, rm } = require('node:fs/promises')
const { constants } = require('node:fs')
const path = require('node:path')

const DEFAULT_RUNTIME_SOURCE = path.resolve(__dirname, '..', 'dist-runtime', 'final')

function runtimeSource() {
  const configured = process.env.DSH_DESKTOP_RUNTIME_SOURCE?.trim()
  return configured ? path.resolve(configured) : DEFAULT_RUNTIME_SOURCE
}

async function afterPack(context) {
  const { appOutDir } = context
  const source = runtimeSource()
  const dest = path.join(appOutDir, 'resources', 'runtime')
  await access(path.join(source, 'package.json'), constants.R_OK)
  await access(path.join(source, 'node_modules'), constants.R_OK)
  console.log(`afterPack: restoring prepared DSH runtime closure from ${source} into ${dest}`)
  // Replace whatever electron-builder copied (it drops node_modules) with the
  // full closure, dereferencing junctions/symlinks into real files.
  await rm(dest, { recursive: true, force: true })
  await cp(source, dest, { recursive: true, dereference: true })
}

module.exports = afterPack
