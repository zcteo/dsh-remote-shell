/**
 * Launch one of the Electron smoke scripts.
 *
 * The scripts run under Electron's own Node rather than plain Node, so they need
 * a launcher that resolves the Electron binary, forwards the environment the
 * script reads, and exits with its status. Keeping the launcher here — instead of
 * a bare `electron` command in the manifest — is what makes the smoke runs
 * reproducible on a machine that only has this package installed.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

/** The smoke scripts this launcher knows, and the file each one runs. */
const SCRIPTS = {
  /** Render the connect page and assert what it shows. */
  page: 'scripts/smoke-page.ts',
  /** Drive a real backend connection; requires `E2E_URL`. */
  connect: 'scripts/e2e-connect.ts',
  /** Read back the window chrome and tray state of one live run. */
  chrome: 'scripts/smoke-chrome.ts',
} as const

type SmokeName = keyof typeof SCRIPTS

const { positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true })
const name = positionals[0]
if (name === undefined || !(name in SCRIPTS)) {
  throw new Error(`run-smoke: expected one of ${Object.keys(SCRIPTS).join(', ')}, got ${String(name)}`)
}
const script = resolve(APP_ROOT, SCRIPTS[name as SmokeName])
if (!existsSync(script)) throw new Error(`run-smoke: ${script} is missing`)

// The page smoke runs against build output, so its absence is a build problem
// rather than a smoke result.
if (!existsSync(resolve(APP_ROOT, 'lib', 'connect', 'connect.html'))) {
  throw new Error('run-smoke: lib/ is missing; run `pnpm run build` first')
}

const executable: unknown = require('electron')
if (typeof executable !== 'string') throw new Error('run-smoke: the electron executable is unavailable')
const env: NodeJS.ProcessEnv = { ...process.env }
// These three make Electron start as the application rather than as plain Node,
// and let it run without a GPU on a headless host.
delete env.ELECTRON_RUN_AS_NODE
env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1'

const launched = spawnSync(executable, ['--no-sandbox', '--disable-gpu', '-r', require.resolve('tsx'), script], {
  cwd: APP_ROOT,
  stdio: 'inherit',
  env,
})
if (launched.error !== undefined) throw launched.error
process.exitCode = launched.status ?? 1
