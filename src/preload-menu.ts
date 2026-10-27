/**
 * The window's menu bar, drawn inside the document instead of by the platform.
 *
 * A native menu bar would sit below a native title bar and take a whole strip
 * from the window; this renderer draws the same two entries in the caption
 * strip of the page, so the shell looks like one application surface. The bar
 * lives in a shadow root so the backend's own stylesheet cannot restyle it, and
 * the menus themselves are native popups anchored to the buttons.
 *
 * It runs in the preload of every document the window loads. The backend page
 * is the one that matters: it is where the menu has to appear. Mounting is
 * best-effort by design — a page that never gains a `body` simply gets no bar.
 */

import { ipcRenderer } from 'electron'
import { IPC } from './ipc.ts'
import type { ShellCopy } from './locale.ts'
import { TITLEBAR_HEIGHT, captionStyle } from './window-chrome.ts'

/** The two menus the bar offers. */
type MenuName = 'application' | 'edit'

/** What the main process needs to open one popup at the button's position. */
interface MenuRequest {
  readonly name: MenuName
  /** Viewport coordinates of the button's bottom-left corner. */
  readonly x: number
  readonly y: number
}

/** Returns the copy of the document's current language. */
type CopyReader = () => ShellCopy

/**
 * Ask the backend page to keep a caption row free for this bar.
 *
 * The client already lays out a Windows caption when the document root carries
 * `data-windows-titlebar`: it pads the application frame by the height published
 * in `--dsh-windows-titlebar-height` and moves its own controls into that strip.
 * Setting both is what makes the bar occupy reserved space instead of covering
 * the sidebar, and it reuses the layout the Desktop application exercises rather
 * than re-teaching the page about a second caption.
 *
 * The attribute is a plain DOM write, and the variable arrives through a
 * constructed stylesheet adopted by the document: both the connect page and the
 * backend serve a `style-src` policy that would refuse a `<style>` element or an
 * inline style, while an adopted sheet is not subject to it.
 *
 * `--dsh-windows-menu-start` is the page's own answer to "where does the caption
 * stop being the sidebar's": 48px clears the sidebar toggle, and a collapsed
 * sidebar moves it to 84px for the new-session button that takes the toggle's
 * place. The bar reads that variable and only falls back to the same 48px when
 * the document is not a dsh application and publishes nothing.
 */
function reserveCaptionRow(): void {
  const root = document.documentElement as HTMLElement | null
  if (root === null) return
  // The connect page is the shell's own document: it has no sidebar, so the bar
  // starts at the window edge and no caption row is reserved for it.
  const backend = location.protocol !== 'file:'
  if (backend && process.platform !== 'darwin') root.dataset.windowsTitlebar = ''
  const sheet = new CSSStyleSheet()
  const declarations = backend
    ? `--dsh-windows-titlebar-height: ${TITLEBAR_HEIGHT}px;`
    : '--dsh-windows-menu-start: 12px;'
  sheet.replaceSync(`:root { ${declarations} }`)
  try {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  } catch (error) {
    // A document that rejects adopted sheets keeps working; the bar only loses
    // the page's own caption padding and floats above the content instead.
    console.warn('remote-shell: the caption row could not be reserved', error)
  }
}

/**
 * Build the shadow-hosted menu bar.
 *
 * The buttons keep the editor's focus and selection: opening a menu must not
 * move the caret out of the composer, so a remembered selection is restored
 * after the popup closes.
 * @param copy - Copy reader for the active language.
 * @returns The update and teardown operations.
 */
export function installMenuBar(copy: CopyReader): { update(): void; dispose(): void } {
  // The caption geometry stays inside this shadow root. Writing it to the page as
  // a custom property would be an inline style, which both the connect page and
  // the backend serve a Content-Security-Policy against; a shadow stylesheet is
  // not subject to that policy and is the only reader of these values anyway.
  const geometry = captionStyle(process.platform)
  const titlebarHeight = geometry['--dsh-remote-titlebar-height'] ?? '40px'
  const controlsInset = geometry['--dsh-remote-controls-inset'] ?? '138px'
  const host = document.createElement('div')
  host.dataset.remoteShellMenu = ''
  const shadow = host.attachShadow({ mode: 'open' })
  // A constructed stylesheet rather than a `<style>` element: both the connect
  // page and the backend serve a Content-Security-Policy whose `style-src` refuses
  // inline style elements, while an adopted stylesheet is not subject to it.
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(`
    :host { position: fixed; top: 0; left: var(--dsh-windows-menu-start, 48px);
      right: ${controlsInset};
      z-index: 2147483000; height: ${titlebarHeight};
      display: flex; align-items: center;
      -webkit-app-region: drag; }
    [role=menubar] { display: flex; gap: 2px; -webkit-app-region: no-drag; }
    button { height: 26px; padding: 0 10px; border: 0; border-radius: 6px;
      background: transparent; color: rgba(232, 232, 238, 0.86);
      font: inherit; font-size: 13px; cursor: default; -webkit-app-region: no-drag; }
    @media (prefers-color-scheme: light) {
      button { color: rgba(26, 26, 32, 0.82); }
      button:hover, button[aria-expanded=true] { background: rgba(0, 0, 0, 0.07); }
    }
    button:hover, button[aria-expanded=true] { background: rgba(255, 255, 255, 0.12); }
  `)
  shadow.adoptedStyleSheets = [sheet]
  const bar = document.createElement('div')
  bar.setAttribute('role', 'menubar')

  let restoreEditor = (): void => {}
  const rememberEditor = (event: FocusEvent): void => {
    const target = event.composedPath()[0]
    if (!(target instanceof HTMLElement) || target === host || shadow.contains(target)) return
    const editable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      || target.matches('[contenteditable="true"]')
    if (!editable) return
    const selection = document.getSelection()
    const ranges = selection === null
      ? []
      : Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : undefined
    const start = input?.selectionStart
    const end = input?.selectionEnd
    const direction = input?.selectionDirection
    restoreEditor = () => {
      if (!target.isConnected) return
      target.focus({ preventScroll: true })
      if (input !== undefined && start != null && end != null) input.setSelectionRange(start, end, direction ?? undefined)
      else if (selection !== null && ranges.length > 0) {
        selection.removeAllRanges()
        for (const range of ranges) selection.addRange(range)
      }
    }
  }
  document.addEventListener('focusout', rememberEditor, true)

  const createButton = (name: MenuName, index: number): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    button.tabIndex = index === 0 ? 0 : -1
    // Keep focus in the editor: a pointerdown that reaches the button would blur it.
    button.addEventListener('pointerdown', (event) => { event.preventDefault() })
    button.addEventListener('mousedown', (event) => { event.preventDefault() })
    const open = async (): Promise<void> => {
      if (button.getAttribute('aria-expanded') === 'true') return
      const rect = button.getBoundingClientRect()
      button.setAttribute('aria-expanded', 'true')
      if (document.activeElement === host) restoreEditor()
      const request: MenuRequest = { name, x: rect.left, y: rect.bottom }
      try {
        await ipcRenderer.invoke(IPC.menu, request)
      } catch (error) {
        console.error('remote-shell: the caption menu could not open', error)
      } finally {
        button.setAttribute('aria-expanded', 'false')
      }
    }
    button.addEventListener('click', () => { void open() })
    button.addEventListener('keydown', (event) => {
      const buttons = bar.querySelectorAll('button')
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const next = buttons[index === 0 ? buttons.length - 1 : 0]
        if (next instanceof HTMLButtonElement) {
          button.tabIndex = -1
          next.tabIndex = 0
          next.focus()
        }
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        void open()
      }
    })
    bar.append(button)
    return button
  }

  const buttons = [createButton('application', 0), createButton('edit', 1)] as const
  shadow.append(bar)

  // The backend document replaces its body as the application boots, so the
  // host is re-attached whenever it is missing rather than mounted once.
  let captionReserved = false
  const ensureMounted = (): void => {
    if (!captionReserved) {
      reserveCaptionRow()
      captionReserved = true
    }
    // `document.body` is null only before the parser creates it, which the
    // readyState check below already excludes.
    if ((document.body as HTMLElement | null) === null) return
    if (host.isConnected) return
    document.body.append(host)
  }
  const observer = new MutationObserver(ensureMounted)
  const observe = (): void => {
    const root = document.documentElement as HTMLElement | null
    if (root === null) return
    observer.observe(root, { childList: true, subtree: true })
  }
  const install = (): void => {
    if (document.readyState === 'loading') return
    observe()
    ensureMounted()
    update()
  }
  if (document.readyState === 'loading') {
    // A preload can run before the parser creates the root element, so the
    // observer attaches only once the document exists.
    document.addEventListener('DOMContentLoaded', install, { once: true })
  } else install()

  const update = (): void => {
    const current = copy()
    bar.setAttribute('aria-label', current.menuBarLabel)
    buttons[0].textContent = current.menuBackend
    buttons[1].textContent = current.menuView
  }

  window.addEventListener('pagehide', () => {
    observer.disconnect()
    document.removeEventListener('focusout', rememberEditor, true)
    document.removeEventListener('DOMContentLoaded', install)
    host.remove()
  }, { once: true })

  return { update, dispose: () => { observer.disconnect(); host.remove() } }
}
