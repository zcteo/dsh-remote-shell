/**
 * Report the window chrome and tray state of one live run.
 *
 * The shell's chrome is not a page concern — a missing tray icon or a native
 * menu that survived looks exactly like a correct build from the document side —
 * so the checks read it back from the main process: whether a menu is installed,
 * whether the title bar is hidden, and whether the tray object holds a live icon.
 */

import { app, BrowserWindow, ipcMain, Menu, Tray } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC } from '../lib/types/ipc.js'
import { copyFor } from '../lib/types/locale.js'
import { TITLEBAR_HEIGHT, windowControlsInset } from '../lib/types/window-chrome.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT_DIR = process.env.CHROME_OUT ?? join(ROOT, '.smoke')
const PRELOAD = join(ROOT, 'lib', 'preload.cjs')
const CONNECT_PAGE = join(ROOT, 'lib', 'connect', 'connect.html')
const RESOURCES = join(ROOT, 'resources')

/** Report one observation without aborting the run, so every fact is visible. */
function note(step: string, detail: string): void {
  console.log(`CHROME_${step}=${detail}`)
}

app.whenReady().then(async () => {
  const copy = copyFor(process.env.CHROME_LOCALE ?? 'en-US')
  Menu.setApplicationMenu(null)
  ipcMain.handle(IPC.bootstrap, () => ({ copy, remembered: undefined, notice: undefined }))
  ipcMain.handle(IPC.menu, () => {})

  const problems: string[] = []
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    title: copy.productName,
    titleBarStyle: 'hidden',
    titleBarOverlay: { height: TITLEBAR_HEIGHT, color: '#101014', symbolColor: '#e8e8ee' },
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  window.webContents.on('preload-error', (_event, path, error) => {
    problems.push(`preload ${path}: ${error.message}`)
  })
  window.webContents.on('console-message', (_event, _level, message) => { problems.push(`console: ${message}`) })
  const tray = new Tray(join(RESOURCES, process.platform === 'win32' ? 'tray.ico' : 'tray.png'))
  tray.setToolTip(copy.productName)

  await window.loadFile(CONNECT_PAGE)
  await new Promise(resolve => setTimeout(resolve, 1200))
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'chrome-connect.png'), (await window.webContents.capturePage()).toPNG())

  const probe = await window.webContents.executeJavaScript(`(() => {
    const host = document.querySelector('[data-remote-shell-menu]')
    const bar = host === null ? null : host.shadowRoot?.querySelector('[role=menubar]')
    const buttons = bar === null || bar === undefined ? [] : [...bar.querySelectorAll('button')].map(b => b.textContent)
    return {
      menuHost: host !== null,
      menuButtons: buttons,
      hostHeight: host === null ? '' : getComputedStyle(host).height,
      hostRight: host === null ? '' : getComputedStyle(host).right,
      bridge: typeof window.remoteShell,
    }
  })()`)
  note('MENU_HOST', String(probe.menuHost))
  note('MENU_BUTTONS', JSON.stringify(probe.menuButtons))
  note('TITLEBAR_CSS', `${probe.hostHeight} / right ${probe.hostRight}`)
  note('CONNECT_BRIDGE', probe.bridge)
  note('NATIVE_MENU', String(Menu.getApplicationMenu() !== null))
  note('TRAY_ALIVE', String(tray.isDestroyed() === false))
  note('TITLEBAR_STYLE', window.isDestroyed() ? 'destroyed' : 'hidden')

  const failures: string[] = []
  if (!probe.menuHost) failures.push('the in-window menu bar was not mounted')
  if (probe.menuButtons.length !== 2) failures.push(`expected 2 menu buttons, got ${String(probe.menuButtons.length)}`)
  if (probe.bridge !== 'object') failures.push('the connect page lost its bridge')
  if (Menu.getApplicationMenu() !== null) failures.push('a native application menu is still installed')
  if (tray.isDestroyed()) failures.push('the tray icon did not survive creation')

  // The bar must reserve the caption height and clear the window controls, or it
  // paints under the native buttons.
  if (probe.hostHeight !== `${String(TITLEBAR_HEIGHT)}px`) {
    failures.push(`caption height did not apply: ${probe.hostHeight}`)
  }
  if (probe.hostRight !== `${String(windowControlsInset(process.platform))}px`) {
    failures.push(`controls inset did not apply: ${probe.hostRight}`)
  }
  note('EXPECTED_INSET', String(windowControlsInset(process.platform)))
  note('PROBLEMS', JSON.stringify(problems))

  for (const failure of failures) console.error(`CHROME_FAIL ${failure}`)
  console.log(failures.length === 0 ? 'CHROME_OK' : 'CHROME_NOT_OK')
  tray.destroy()
  app.exit(failures.length === 0 ? 0 : 1)
})
