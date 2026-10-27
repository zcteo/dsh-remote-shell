import { defineConfig } from 'tsdown'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = fileURLToPath(new URL('.', import.meta.url))
const LIB = resolve(APP_ROOT, 'lib')

/**
 * Copy the connect page's markup and stylesheet beside its bundle.
 *
 * The page loads both by relative URL, so they must sit next to the emitted
 * `connect.js` rather than inside the type-check output the bundler consumes.
 * @returns The bundler plugin that performs the copy once per build.
 */
function copyConnectAssets(): { name: string; writeBundle: () => void } {
  return {
    name: 'remote-shell-connect-assets',
    writeBundle() {
      const target = resolve(LIB, 'connect')
      mkdirSync(target, { recursive: true })
      for (const name of ['connect.html', 'connect.css']) {
        copyFileSync(resolve(APP_ROOT, 'src', 'connect', name), resolve(target, name))
      }
    },
  }
}

// The main bundle and the sandboxed preload differ in what they may require:
// Electron and Node built-ins for the main process, Electron alone for the
// preload. Neither bundles the connect page, which is its own document.
export default defineConfig([
  {
    entry: ['lib/types/main.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    codeSplitting: false,
    deps: { neverBundle: ['electron'] },
  },
  {
    // Sandboxed Electron preloads run as CommonJS even though the package is ESM.
    entry: { preload: 'lib/types/preload.js' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    codeSplitting: false,
    deps: { neverBundle: ['electron'] },
  },
  {
    entry: { connect: 'lib/types/connect/connect.js' },
    outDir: 'lib/connect',
    format: ['esm'],
    platform: 'browser',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    codeSplitting: false,
    plugins: [copyConnectAssets()],
  },
])
