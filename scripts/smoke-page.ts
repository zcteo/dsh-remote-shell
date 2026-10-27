/**
 * Render the connect page in a real Electron window and capture what it shows.
 *
 * This is the smoke test for the shell's only local document: it registers the
 * same IPC handlers the main process does, loads the built page, reads the
 * rendered text back, and writes a screenshot. It fails loudly when the page is
 * blank, when the bridge is missing, or when the preload reported an error.
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC } from '../lib/types/ipc.js'
import { copyFor } from '../lib/types/locale.js'
import { readStoredBackend } from '../lib/types/backend-store.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = process.env.SMOKE_OUT ?? join(ROOT, '.smoke', 'connect-page.png')

/** What the page rendered, as returned by the in-page probe. */
interface Probe {
  readonly heading: string
  readonly description: string
  readonly label: string
  readonly button: string
  readonly hint: string
  readonly placeholder: string
  readonly bridge: string
}

app.whenReady().then(async () => {
  const copy = copyFor(process.env.SMOKE_LOCALE ?? 'en-US')
  ipcMain.handle(IPC.bootstrap, () => ({
    copy,
    remembered: 'http://127.0.0.1:3080/',
    notice: undefined,
  }))

  const window = new BrowserWindow({
    width: 900,
    height: 620,
    show: false,
    backgroundColor: '#101014',
    webPreferences: {
      preload: join(ROOT, 'lib', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const problems: string[] = []
  window.webContents.on('console-message', (_event, _level, message) => { problems.push(message) })
  window.webContents.on('preload-error', (_event, path, error) => { problems.push(`preload ${path}: ${error.message}`) })

  await window.loadFile(join(ROOT, 'lib', 'connect', 'connect.html'))
  await new Promise(resolve => setTimeout(resolve, 1200))

  const probe = await window.webContents.executeJavaScript(`(() => {
    const pick = (id) => document.querySelector('#' + id)
    return {
      heading: pick('heading').textContent,
      description: pick('description').textContent,
      label: pick('address-label').textContent,
      button: pick('submit').textContent,
      hint: pick('hint').textContent,
      placeholder: pick('address').placeholder,
      bridge: typeof window.remoteShell,
    }
  })()`) as Probe

  const image = await window.webContents.capturePage()
  mkdirSync(join(OUT, '..'), { recursive: true })
  writeFileSync(OUT, image.toPNG())

  const failures: string[] = []
  if (probe.bridge !== 'object') failures.push(`preload bridge missing (typeof = ${probe.bridge})`)
  if (probe.heading === '') failures.push('heading rendered empty')
  if (probe.label === '') failures.push('address label rendered empty')
  if (probe.button === '') failures.push('connect button rendered empty')
  if (probe.placeholder === '') failures.push('address placeholder rendered empty')
  if (problems.length > 0) failures.push(`page reported: ${problems.join(' | ')}`)

  console.log(`SMOKE_OUT=${OUT}`)
  console.log(`SMOKE_PROBE=${JSON.stringify(probe)}`)
  if (failures.length > 0) {
    for (const failure of failures) console.error(`SMOKE_FAIL ${failure}`)
    app.exit(1)
    return
  }
  console.log('SMOKE_OK')
  app.exit(0)
})

// The stored-backend read is exercised so the smoke run also proves the
// settings path resolves on this platform, not only that the page paints.
console.log(`SMOKE_STORE=${readStoredBackend(join(app.getPath('userData'), 'backend.json')).kind}`)
