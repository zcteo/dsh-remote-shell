/**
 * Preload for every document this window loads.
 *
 * Two responsibilities, split by trust. The connect page is the shell's own
 * document and receives the bridge on `window.remoteShell`. The backend page is
 * a deployment this shell did not write, so it receives no bridge at all — only
 * the caption menu bar, which runs in this isolated world and reaches the main
 * process through `ipcRenderer` rather than through anything the page can see.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc.ts'
import type { BootstrapPayload, ConnectResult, RemoteShellBridge } from './ipc.ts'
import { installMenuBar } from './preload-menu.ts'
import { copyFor } from './locale.ts'

// `file:` is the connect page and nothing else in this window.
if (location.protocol === 'file:') {
  const bridge: RemoteShellBridge = {
    bootstrap: () => ipcRenderer.invoke(IPC.bootstrap) as Promise<BootstrapPayload>,
    connect: (address: string) => ipcRenderer.invoke(IPC.connect, address) as Promise<ConnectResult>,
  }
  contextBridge.exposeInMainWorld('remoteShell', bridge)
}

// The bar belongs to the shell, not to the page, so it is installed for both
// documents. Language changes reach it through the document's own `lang`
// attribute, which the backend keeps current as its settings change.
const language = (): string => document.documentElement.lang || navigator.language
const menu = installMenuBar(() => copyFor(language()))
const observer = new MutationObserver(() => { menu.update() })
/** Attach the language observer once the parser has created the root element. */
const watchLanguage = (): void => {
  const root = document.documentElement as HTMLElement | null
  if (root === null) return
  observer.observe(root, { attributes: true, attributeFilter: ['lang'] })
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchLanguage, { once: true })
} else watchLanguage()
window.addEventListener('pagehide', () => { observer.disconnect() }, { once: true })
