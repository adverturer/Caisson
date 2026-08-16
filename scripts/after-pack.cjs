/**
 * electron-builder afterPack hook.
 *
 * electron-builder's file filter hard-excludes a root `node_modules` directory
 * from extraResources (util/filter.js: "filter the root node_modules"), so a
 * packaged dsh runtime closure would silently lose its node_modules tree. This
 * hook copies the full rc.6 runtime closure (package.json + node_modules, with
 * the user's reasoning-effort + cancel-all feature overlay applied) into the
 * unpacked app's resources/runtime after packaging, restoring what the filter
 * dropped. Runs for every produced target (win-unpacked / nsis both).
 *
 * The closure source is the npm-installed rc.6 at C:\Users\幻梦\Desktop\ds.
 *
 * @type {import('electron-builder').AfterPackHook}
 */
const { cp, rm } = require('node:fs/promises')
const path = require('node:path')

/** Source of the bundled rc.6 runtime closure (npm install + feature overlay). */
const RUNTIME_SOURCE = 'C:\\Users\\幻梦\\Desktop\\ds'

async function afterPack(context) {
  const { appOutDir } = context
  const dest = path.join(appOutDir, 'resources', 'runtime')
  console.log(`afterPack: restoring rc.6 dsh runtime closure from ${RUNTIME_SOURCE} into ${dest}`)
  // Replace whatever electron-builder copied (it drops node_modules) with the
  // full closure, dereferencing junctions/symlinks into real files.
  await rm(dest, { recursive: true, force: true })
  await cp(RUNTIME_SOURCE, dest, { recursive: true, dereference: true })
}

module.exports = afterPack