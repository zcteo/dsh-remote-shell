/**
 * Drive the shell end to end against a real backend.
 *
 * The main process's own connect path is exercised: the window starts on the
 * built connect page, the script submits a tokenized address through the same
 * IPC handler the page calls, and the run succeeds only when the resulting
 * document is the backend's own page rather than the connect page again. A
 * screenshot of each state is written beside the probe output.
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC } from '../lib/types/ipc.js'
import { parseBackendUrl } from '../lib/types/backend-url.js'
import { copyFor, rejectionMessage } from '../lib/types/locale.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT_DIR = process.env.E2E_OUT ?? join(ROOT, '.smoke')
const CONNECT_PAGE = join(ROOT, 'lib', 'connect', 'connect.html')
const TARGET = process.env.E2E_URL ?? ''

/** Report one step without aborting the run, so every observation is visible. */
function note(step: string, detail: string): void {
  console.log(`E2E_${step}=${detail}`)
}

app.whenReady().then(async () => {
  if (TARGET === '') {
    console.error('E2E_FAIL no E2E_URL supplied')
    app.exit(1)
    return
  }
  const copy = copyFor(process.env.E2E_LOCALE ?? 'en-US')
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    backgroundColor: '#101014',
    webPreferences: {
      preload: join(ROOT, 'lib', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // The same handler the production main process registers, so the address this
  // run submits travels the real validation and navigation path.
  const connect = async (address: string): Promise<{ ok: boolean; message?: string }> => {
    const parsed = parseBackendUrl(address)
    if (!parsed.ok) return { ok: false, message: rejectionMessage(copy, parsed.reason) }
    try {
      await window.loadURL(parsed.url)
      return { ok: true }
    } catch (error) {
      await window.loadFile(CONNECT_PAGE)
      return { ok: false, message: copy.errorRefused }
    }
  }
  ipcMain.handle(IPC.bootstrap, () => ({ copy, remembered: TARGET, notice: undefined }))
  ipcMain.handle(IPC.connect, (_event, address: unknown) =>
    typeof address === 'string' ? connect(address) : { ok: false, message: copy.errorRefused })

  mkdirSync(OUT_DIR, { recursive: true })
  await window.loadFile(CONNECT_PAGE)
  await new Promise(resolve => setTimeout(resolve, 900))
  writeFileSync(join(OUT_DIR, 'e2e-1-connect.png'), (await window.webContents.capturePage()).toPNG())
  note('PAGE_CONNECT', window.webContents.getURL())

  // Submit through the page's own form, so the preload bridge and the page's
  // submit handler are both part of what this run proves.
  await window.webContents.executeJavaScript(`(() => {
    document.querySelector('#address').value = ${JSON.stringify(TARGET)}
    document.querySelector('#form').dispatchEvent(new Event('submit', { cancelable: true }))
    return true
  })()`)

  for (let waited = 0; waited < 30_000; waited += 500) {
    if (!window.webContents.getURL().startsWith('file://')) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  await new Promise(resolve => setTimeout(resolve, 4000))

  const loaded = window.webContents.getURL()
  const title = await window.webContents.executeJavaScript('document.title')
  const rootChildren = await window.webContents.executeJavaScript(
    'document.querySelector("#root") ? document.querySelector("#root").childElementCount : -1')
  // The bridge belongs to the connect page only: the backend document must not
  // be able to reach the shell's IPC at all.
  const bridgeInBackend = await window.webContents.executeJavaScript('typeof window.remoteShell')
  note('BACKEND_BRIDGE', bridgeInBackend)
  // The caption bar belongs to the shell, so it must appear over the backend's
  // own document too — that is the surface this change exists for.
  const menuInBackend = await window.webContents.executeJavaScript(`(() => {
    const host = document.querySelector('[data-remote-shell-menu]')
    const bar = host === null ? null : host.shadowRoot?.querySelector('[role=menubar]')
    return {
      host: host !== null,
      buttons: bar === null || bar === undefined ? [] : [...bar.querySelectorAll('button')].map(b => b.textContent),
      height: host === null ? '' : getComputedStyle(host).height,
    }
  })()`)
  note('BACKEND_MENU', JSON.stringify(menuInBackend))
  writeFileSync(join(OUT_DIR, 'e2e-2-backend.png'), (await window.webContents.capturePage()).toPNG())

  note('PAGE_BACKEND', loaded)
  note('TITLE', title)
  note('ROOT_CHILDREN', String(rootChildren))

  const failures: string[] = []
  if (loaded.startsWith('file://')) failures.push('window stayed on the connect page')
  if (!loaded.startsWith(new URL(TARGET).origin)) failures.push(`window left the backend origin: ${loaded}`)
  if (rootChildren === 0) failures.push('backend document rendered an empty root element')
  if (bridgeInBackend !== 'undefined') failures.push(`backend document received the shell bridge (typeof = ${bridgeInBackend})`)
  if (!menuInBackend.host) failures.push('the caption menu bar is missing over the backend document')
  if (menuInBackend.buttons.length !== 2) failures.push(`expected 2 caption buttons over the backend, got ${String(menuInBackend.buttons.length)}`)

  for (const failure of failures) console.error(`E2E_FAIL ${failure}`)
  console.log(failures.length === 0 ? 'E2E_OK' : 'E2E_NOT_OK')
  app.exit(failures.length === 0 ? 0 : 1)
})
