/**
 * electron-builder afterPack hook.
 *
 * electron-builder's file filter hard-excludes a root `node_modules` directory
 * from extraResources (util/filter.js: "filter the root node_modules"), so a
 * packaged dsh runtime closure would silently lose its node_modules tree. This
 * hook copies the full prepared closure (package.json + node_modules) into the
 * unpacked app's resources/runtime after packaging, restoring what the filter
 * dropped. Runs for every produced target (win-unpacked / nsis both).
 *
 * @type {import('electron-builder').AfterPackHook}
 */
const { cp, rm } = require('node:fs/promises')
const path = require('node:path')

async function afterPack(context) {
  const { appOutDir, packager } = context
  const projectDir = packager.projectDir
  const src = path.join(projectDir, 'dist-runtime', 'final')
  const dest = path.join(appOutDir, 'resources', 'runtime')
  console.log(`afterPack: restoring dsh runtime closure into ${dest}`)
  // Replace whatever electron-builder copied (it drops node_modules) with the
  // full closure, dereferencing junctions/symlinks into real files.
  await rm(dest, { recursive: true, force: true })
  await cp(src, dest, { recursive: true, dereference: true })
}

module.exports = afterPack