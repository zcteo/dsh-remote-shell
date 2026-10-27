/**
 * Electron main process for the remote shell.
 *
 * The shell owns a window, a tray icon, and a remembered address, nothing else:
 * it starts no Host, bundles no dsh runtime, and speaks to the backend only as
 * the browser that loads its pages. That shape is why the address is entered by
 * hand and why the window navigates to it rather than proxying it — the
 * `dsh web` launch token is exchanged for a signed cookie by the deployment
 * itself, during an ordinary top-level navigation this window performs like any
 * browser.
 *
 * The window has no native title bar and no native menu bar. Its window controls
 * come from the platform title-bar overlay, its menus are drawn inside the page
 * by the preload, and closing it hides it to the tray instead of ending the
 * process.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron'
import { backendAuthority, parseBackendUrl, withoutLaunchToken } from './backend-url.ts'
import { readStoredBackend, writeStoredBackend } from './backend-store.ts'
import { IPC } from './ipc.ts'
import type { BootstrapPayload, ConnectResult, MenuRequest } from './ipc.ts'
import { copyFor, rejectionMessage } from './locale.ts'
import { ShellTray } from './tray.ts'
import { TITLEBAR_HEIGHT } from './window-chrome.ts'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONNECT_PAGE = join(APP_ROOT, 'lib', 'connect', 'connect.html')
// Sandboxed preloads are always CommonJS whatever the package's module type
// says, so the bundle keeps the `.cjs` extension the bundler assigns it.
const PRELOAD = join(APP_ROOT, 'lib', 'preload.cjs')
const RESOURCES = join(APP_ROOT, 'resources')

/** Electron reports an aborted navigation when one load supersedes another; it is not a failure. */
const ERR_ABORTED = -3

/** The single dark/light pair the caption uses, matching the connect page. */
const CAPTION_DARK = '#101014'
const CAPTION_LIGHT = '#f6f6f8'

/** The one window this application owns. */
let mainWindow: BrowserWindow | undefined
/** The tray icon, present for the whole run. */
let tray: ShellTray | undefined
/** Set while a quit is actually in progress, so the close handler stops hiding. */
let quitting = false

/**
 * Notice shown above the address field the next time the connect page renders.
 * Set when the window returns from a backend page, cleared when the page reads
 * it, so a stale reason never survives a later launch.
 */
let pendingNotice: string | undefined

/** Absolute path of the remembered-address file. */
function settingsPath(): string {
  return join(app.getPath('userData'), 'backend.json')
}

/** Absolute path of the one-time background acknowledgement marker. */
function backgroundMarkerPath(): string {
  return join(app.getPath('userData'), 'background-close-confirmed')
}

/**
 * Read the copy the interface renders.
 * @returns The dictionary of the process locale.
 */
function activeCopy(): BootstrapPayload['copy'] {
  return copyFor(app.getLocale())
}

/** The caption fill that matches the active platform theme. */
function captionColor(): string {
  return nativeTheme.shouldUseDarkColors ? CAPTION_DARK : CAPTION_LIGHT
}

/** The caption symbol color that stays legible on {@link captionColor}. */
function captionSymbolColor(): string {
  return nativeTheme.shouldUseDarkColors ? '#e8e8ee' : '#1a1a20'
}

/**
 * Load the local connect page, which is the only document that is ever given
 * the preload bridge.
 * @param window - Window to navigate.
 * @returns A promise settling when the page finished loading.
 */
async function loadConnectPage(window: BrowserWindow): Promise<void> {
  await window.loadFile(CONNECT_PAGE)
}

/**
 * Navigate the window to a backend address.
 *
 * A refused connection kills the document in place, so this restores the
 * connect page before reporting, and the caller returns the reason to the page
 * that is by then on screen. `notice` lets a caller say why the window came
 * back, which the automatic reconnect uses to distinguish a backend that is
 * merely not running yet from one that refused this client.
 * @param window - Window to navigate.
 * @param url - Normalized backend URL.
 * @param notice - Reason to show on the connect page when the load is refused.
 * @returns The refusal sentence, or undefined when the backend answered.
 */
async function loadBackend(
  window: BrowserWindow,
  url: string,
  notice: string = activeCopy().errorRefused,
): Promise<string | undefined> {
  try {
    await window.loadURL(url)
    return undefined
  } catch (error) {
    await loadConnectPage(window)
    pendingNotice = notice
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`remote-shell: cannot open ${url}: ${detail}`)
    return notice
  }
}

/**
 * Open the remembered backend at startup.
 *
 * The stored address is a convenience, never a requirement: a launch with no
 * remembered address, an address the backend no longer answers on, and a
 * backend that refuses this client all end on the connect page with the address
 * pre-filled, so the person can fix it in place instead of hunting for the
 * remembered value.
 *
 * The address is stored without its launch token, so this relies on the signed
 * session cookie the first connection minted. That cookie outlives `dsh web`
 * restarts because its signing secret is persisted, which is what makes an
 * automatic reconnect work at all; when the cookie has expired or the deployment
 * rotated its secret, the backend answers 401 and the connect page asks for a
 * fresh tokenized URL.
 * @param window - Window to navigate.
 * @returns True when the backend took the window.
 */
async function openRememberedBackend(window: BrowserWindow): Promise<boolean> {
  const stored = readStoredBackend(settingsPath())
  if (stored.kind !== 'stored') return false
  const copy = activeCopy()
  const refusal = await loadBackend(window, stored.backend.url, copy.reconnectFailed)
  if (refusal !== undefined) return false
  // A backend that is running but refuses this client answers 401 and still
  // loads a document, so the load itself succeeds. That is a cookie that expired
  // or a rotated signing secret, and it needs the connect page just as much as an
  // unreachable backend does — landing on a bare 401 is not a usable state.
  if (isUnauthorized(window)) {
    console.warn(`remote-shell: ${stored.backend.url} refused this session`)
    pendingNotice = copy.reconnectFailed
    return false
  }
  window.setTitle(`${copy.productName} — ${backendAuthority(stored.backend.url)}`)
  return true
}

/**
 * Return the window to the connect page.
 *
 * Closing it later hides to the tray, so a window brought back from the tray
 * resumes whatever document it held; changing backends is the one action that
 * deliberately replaces that document.
 */
function changeBackend(): void {
  const window = mainWindow
  if (window === undefined) return
  pendingNotice = undefined
  void loadConnectPage(window)
}

/** Reload the open backend, leaving the connect page alone when it is showing. */
function reloadBackend(): void {
  const window = mainWindow
  if (window === undefined || isConnectPage(window)) return
  window.webContents.reload()
}

/**
 * Build the template of one caption menu.
 * @param name - Which menu the bar asked for.
 * @returns Items in display order.
 */
function captionMenuItems(name: MenuRequest['name']): MenuItemConstructorOptions[] {
  const copy = activeCopy()
  if (name === 'edit') {
    return [
      { label: copy.menuUndo, role: 'undo' },
      { label: copy.menuRedo, role: 'redo' },
      { type: 'separator' },
      { label: copy.menuCut, role: 'cut' },
      { label: copy.menuCopy, role: 'copy' },
      { label: copy.menuPaste, role: 'paste' },
      { type: 'separator' },
      { label: copy.menuSelectAll, role: 'selectAll' },
    ]
  }
  return [
    { label: copy.menuChangeBackend, accelerator: 'CmdOrCtrl+Shift+B', click: changeBackend },
    { label: copy.menuReload, accelerator: 'CmdOrCtrl+R', click: reloadBackend },
    { type: 'separator' },
    { label: copy.menuOpen, click: () => { showWindow() } },
    { label: copy.menuExit, click: () => { quitApplication() } },
  ]
}

/**
 * Open one caption menu as a native popup under the requesting button.
 * @param event - Invocation event whose sender is checked.
 * @param request - Menu name and the button's viewport position.
 */
async function openCaptionMenu(event: IpcMainInvokeEvent, request: unknown): Promise<void> {
  assertShellFrame(event)
  if (!isMenuRequest(request)) throw new Error('remote-shell: invalid menu request')
  const window = mainWindow
  if (window === undefined) return
  const menu = Menu.buildFromTemplate(captionMenuItems(request.name))
  await new Promise<void>((resolve) => {
    menu.popup({
      window,
      x: Math.round(request.x),
      y: Math.round(request.y),
      // A popup is modal to the window; reporting its close keeps the bar's
      // aria-expanded honest for the next open.
      callback: () => { resolve() },
    })
  })
}

/**
 * Narrow one menu request at the IPC boundary.
 * @param value - Payload as received.
 * @returns True for a well-formed request.
 */
function isMenuRequest(value: unknown): value is MenuRequest {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.name !== 'application' && record.name !== 'edit') return false
  for (const coordinate of [record.x, record.y]) {
    if (typeof coordinate !== 'number' || !Number.isFinite(coordinate)) return false
    if (coordinate < 0 || coordinate > 100_000) return false
  }
  return true
}

/**
 * Whether the document the window holds is the backend's refusal response.
 *
 * `loadURL` resolves for any document the server returns, including the minimal
 * 401 body `dsh web` serves an unauthenticated client, so the status code has to
 * be read back from the navigation rather than inferred from the load.
 * @param window - Window whose last main-frame navigation is inspected.
 * @returns True when the backend answered 401 for the current document.
 */
function isUnauthorized(window: BrowserWindow): boolean {
  const url = window.webContents.getURL()
  if (!url.startsWith('http')) return false
  // Electron keeps the last response code in the navigation entry that produced
  // the current document.
  return lastResponseCode(window) === 401
}

/** Last main-frame HTTP status, recorded on every completed navigation. */
const responseCodes = new WeakMap<BrowserWindow, number>()

/**
 * Read the status the window's current document was served with.
 * @param window - Window to inspect.
 * @returns The recorded status code, or 0 when it was not an HTTP navigation.
 */
function lastResponseCode(window: BrowserWindow): number {
  return responseCodes.get(window) ?? 0
}

/**
 * Whether the window currently shows the local connect page.
 * @param window - Window to inspect.
 * @returns True while the connect document is loaded.
 */
function isConnectPage(window: BrowserWindow): boolean {
  return window.webContents.getURL().startsWith('file://')
}

/**
 * Whether one IPC call comes from the local connect page.
 *
 * The window later holds the backend's own document, so this is the second of
 * the two independent checks that keep the bridge out of a deployment this
 * shell did not review: the preload exposes nothing over `http(s):`, and the
 * handlers here refuse anything but the `file:` document they serve.
 * @param event - Invocation event whose sender is checked.
 * @returns True only for the connect page's own main frame.
 */
function fromConnectPage(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  return frame !== null && frame.parent === null && frame.url.startsWith('file://')
}

/**
 * Require an IPC call from this window's own top-level frame.
 *
 * The menu channel is served to whichever document the window holds, so the
 * sender check is what keeps an embedded frame of the backend page from opening
 * a menu on its own behalf.
 * @param event - Invocation event whose sender is checked.
 */
function assertShellFrame(event: IpcMainInvokeEvent): void {
  const window = mainWindow
  const frame = event.senderFrame
  if (window === undefined || frame === null || frame !== window.webContents.mainFrame) {
    throw new Error('remote-shell: rejected sender')
  }
}

/** Read the state the connect page renders, consuming any pending notice. */
function bootstrapPayload(): BootstrapPayload {
  const copy = activeCopy()
  const stored = readStoredBackend(settingsPath())
  const notice = pendingNotice ?? (stored.kind === 'unreadable' ? copy.warningUnreadable : undefined)
  pendingNotice = undefined
  return {
    copy,
    remembered: stored.kind === 'stored' ? stored.backend.url : undefined,
    notice,
  }
}

/**
 * Validate one typed address against the parser and the live window.
 * @param address - Text exactly as typed.
 * @returns The success marker, or the localized refusal.
 */
async function connect(address: string): Promise<ConnectResult> {
  const copy = activeCopy()
  const parsed = parseBackendUrl(address)
  if (!parsed.ok) return { ok: false, message: rejectionMessage(copy, parsed.reason) }
  const window = mainWindow
  if (window === undefined) return { ok: false, message: copy.errorRefused }
  const refusal = await loadBackend(window, parsed.url)
  if (refusal !== undefined) return { ok: false, message: refusal }
  // The token did its one job during that navigation; storing it would only keep
  // a per-process credential on disk, and it is already dead by the next launch.
  const remembered = withoutLaunchToken(parsed.url)
  writeStoredBackend(settingsPath(), { url: remembered })
  window.setTitle(`${copy.productName} — ${backendAuthority(remembered)}`)
  return { ok: true }
}

/** Show and focus the window, restoring it from a minimized or hidden state. */
function showWindow(): void {
  const window = mainWindow
  if (window === undefined) {
    void createWindow().then((created) => {
      mainWindow = created
      created.on('closed', () => { if (mainWindow === created) mainWindow = undefined })
    })
    return
  }
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

/** Leave the application, releasing the tray so no dead icon outlives the process. */
function quitApplication(): void {
  quitting = true
  tray?.dispose()
  tray = undefined
  app.quit()
}

/**
 * Apply one-time explanation before the first hide, so a window that disappears
 * is not mistaken for a crash. The acknowledgement is remembered, so later
 * closes hide silently.
 * @param window - Window being closed.
 */
async function confirmBackgroundRunning(window: BrowserWindow): Promise<void> {
  const copy = activeCopy()
  try {
    const result = await dialog.showMessageBox(window, {
      type: 'info',
      title: copy.productName,
      message: copy.backgroundNoticeBody,
      buttons: [copy.backgroundNoticeConfirm],
      defaultId: 0,
      cancelId: -1,
      noLink: true,
    })
    if (result.response !== 0) return
    writeFileSync(backgroundMarkerPath(), '')
  } catch (error) {
    console.warn('remote-shell: the background notice could not be shown', error)
  }
  if (!quitting && !window.isDestroyed()) window.hide()
}

/** Create the single application window pointed at the connect page. */
async function createWindow(): Promise<BrowserWindow> {
  const copy = activeCopy()
  const window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 520,
    minHeight: 480,
    show: false,
    title: copy.productName,
    backgroundColor: captionColor(),
    icon: join(RESOURCES, process.platform === 'win32' ? 'icon-win.png' : 'icon.png'),
    // The title bar is drawn by the page. Windows and Linux keep their window
    // controls through the overlay, which also publishes their geometry to CSS;
    // macOS keeps its traffic lights inset over the caption strip.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } }
      : {
        titleBarStyle: 'hidden' as const,
        titleBarOverlay: {
          height: TITLEBAR_HEIGHT,
          color: captionColor(),
          symbolColor: captionSymbolColor(),
        },
      }),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // A `persist:` partition is what keeps the backend's signed session cookie
      // across launches. Without one Electron uses an in-memory session, so every
      // restart would arrive unauthenticated and the remembered address could
      // never reopen without a fresh token.
      partition: 'persist:remote-shell',
    },
  })
  window.once('ready-to-show', () => { window.show() })
  // Closing hides: the page and its live connection keep running, and the tray
  // is what brings the same document back.
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    if (existsSync(backgroundMarkerPath())) {
      window.hide()
      return
    }
    void confirmBackgroundRunning(window)
  })
  // Any link asking for a new window belongs to the system browser: this shell
  // owns exactly one document and grants no second one the backend session.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Every completed main-frame navigation records its status, because a refused
  // request and a served document look identical from the load promise alone.
  window.webContents.on('did-navigate', (_event, _url, httpResponseCode) => {
    responseCodes.set(window, httpResponseCode)
  })
  // A failed main-frame navigation outside the connect flow returns to the page
  // with its reason, so a backend that later goes away is recoverable in place.
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === ERR_ABORTED) return
    if (validatedURL.startsWith('file://')) return
    console.error(`remote-shell: ${validatedURL} failed to load: ${errorDescription}`)
  })
  // Startup goes straight to the remembered backend when there is one; the
  // connect page is the fallback, not the first stop.
  if (!await openRememberedBackend(window)) await loadConnectPage(window)
  return window
}

// One instance owns one window and one settings file; a second launch shows the
// existing window instead of racing it for the file.
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => { showWindow() })

  void app.whenReady().then(async () => {
    if (!existsSync(CONNECT_PAGE)) {
      const copy = activeCopy()
      await dialog.showMessageBox({
        type: 'error',
        message: copy.missingBuildTitle,
        detail: `${copy.missingBuildDetail}\n\n${CONNECT_PAGE}`,
      })
      app.quit()
      return
    }
    // No native application menu: the caption bar and the tray own every command.
    // An empty menu is what removes the default Electron menu from the window.
    Menu.setApplicationMenu(null)
    ipcMain.handle(IPC.bootstrap, event =>
      fromConnectPage(event)
        ? bootstrapPayload()
        : Promise.reject(new Error('remote-shell: bootstrap is only available to the connect page')))
    ipcMain.handle(IPC.connect, (event, address: unknown) => {
      if (!fromConnectPage(event)) {
        return Promise.reject(new Error('remote-shell: connect is only available to the connect page'))
      }
      return typeof address === 'string'
        ? connect(address)
        : Promise.resolve<ConnectResult>({ ok: false, message: activeCopy().errorRefused })
    })
    ipcMain.handle(IPC.menu, (event, request: unknown) => openCaptionMenu(event, request))
    mainWindow = await createWindow()
    mainWindow.on('closed', () => { if (mainWindow !== undefined) mainWindow = undefined })
    try {
      tray = new ShellTray({
        iconPath: join(RESOURCES, process.platform === 'win32' ? 'tray.ico' : 'tray.png'),
        copy: activeCopy,
        open: showWindow,
        quit: quitApplication,
      })
    } catch (error) {
      // A host without a tray area still has the window; without one, closing the
      // window would strand the process, so the marker grants a direct hide.
      console.warn('remote-shell: the tray icon is unavailable', error)
    }
    // Keep the caption overlay legible when the platform theme flips.
    nativeTheme.on('updated', () => {
      const window = mainWindow
      if (window === undefined || process.platform === 'darwin') return
      try {
        window.setTitleBarOverlay({
          height: TITLEBAR_HEIGHT,
          color: captionColor(),
          symbolColor: captionSymbolColor(),
        })
      } catch (error) {
        console.warn('remote-shell: the caption overlay could not be updated', error)
      }
    })
  })

  // A hidden window keeps the application alive: the tray is the way back, so
  // closing the last window must not end the process.
  app.on('window-all-closed', () => {
    if (process.platform === 'darwin' || tray !== undefined) return
    app.quit()
  })

  app.on('before-quit', () => { quitting = true })
  app.on('activate', () => { showWindow() })
} else {
  app.quit()
}
