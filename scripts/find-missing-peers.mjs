/**
 * One-shot helper: find @deepseek-ai/* peer dependencies referenced anywhere in
 * the deployed runtime closure that are NOT present in the closure, so the
 * runtime-deploy manifest can be completed (pnpm deploy does not install peers
 * under --legacy). Prints the sorted missing names.
 *
 * Usage: node scripts/find-missing-peers.mjs <payloadDir>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const payload = process.argv[2]
if (!payload) throw new Error('usage: find-missing-peers.mjs <payloadDir>')

const present = new Set()
const referenced = new Set()

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.bin') continue
    const full = join(dir, entry)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walk(full)
    else if (entry === 'package.json') {
      try {
        const json = JSON.parse(readFileSync(full, 'utf8'))
        if (json.name && json.name.startsWith('@deepseek-ai/')) present.add(json.name)
        for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
          if (!json[section]) continue
          for (const name of Object.keys(json[section])) {
            if (name.startsWith('@deepseek-ai/')) referenced.add(name)
          }
        }
      } catch { /* unparseable */ }
    }
  }
}

const nm = join(payload, 'node_modules')
walk(nm)

const missing = [...referenced].filter((name) => !present.has(name)).sort()
console.log('MISSING_PEERS_START')
console.log(missing.join('\n'))
console.log('MISSING_PEERS_END')
console.log(`present=${present.size} referenced=${referenced.size} missing=${missing.length}`)