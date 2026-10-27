/**
 * Run the remote shell from source.
 *
 * The script builds the application unless asked not to, then launches the
 * Electron binary this package installed. Nothing is packaged and no backend is
 * started, so the window opens on the connect page exactly as a release build
 * does.
 */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { 'skip-build': { type: 'boolean', default: false } },
})

if (!values['skip-build']) {
  const built = spawnSync('pnpm', ['run', 'build'], { cwd: APP_ROOT, stdio: 'inherit' })
  if (built.error !== undefined) throw built.error
  if (built.status !== 0) throw new Error(`dev: build exited with ${String(built.status)}`)
}

const main = resolve(APP_ROOT, 'lib', 'main.js')
if (!existsSync(main)) throw new Error('dev: lib/main.js is missing; run `pnpm run build`')

// `require('electron')` resolves to the executable path, downloading the
// distribution on first use. ELECTRON_RUN_AS_NODE must not leak in from a parent
// that itself ran under Electron.
const executable: unknown = require('electron')
if (typeof executable !== 'string') throw new Error('dev: the electron executable is unavailable')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const launched = spawnSync(executable, [APP_ROOT, ...process.argv.slice(2).filter(a => !a.startsWith('--'))], {
  cwd: APP_ROOT,
  stdio: 'inherit',
  env,
})
if (launched.error !== undefined) throw launched.error
process.exitCode = launched.status ?? 1
