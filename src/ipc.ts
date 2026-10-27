/**
 * The main process ↔ renderer message contract.
 *
 * One payload per channel and one fail-closed rule: no document decides whether
 * an address is usable, because only the main process loads it and only it knows
 * whether the load succeeded. A window that returns to the connect page carries
 * its reason in the next bootstrap, so the page never has to receive an event
 * while it is still loading.
 *
 * The menu channel is called from the preload's isolated world, not from page
 * script, so the backend document cannot reach it even though the bar it draws
 * appears inside that document.
 */

import type { ShellCopy } from './locale.ts'

/** Every invoke channel the preload may call. */
export const IPC = {
  /** Read the copy, the remembered address, and any notice to show. */
  bootstrap: 'remote-shell:bootstrap',
  /** Submit one typed address; resolves after the window navigates or refuses. */
  connect: 'remote-shell:connect',
  /** Open one caption menu as a native popup at the requesting button. */
  menu: 'remote-shell:menu',
} as const

/** The menus the caption bar offers. */
export type ShellMenuName = 'application' | 'edit'

/** One caption menu request, positioned in the document's viewport. */
export interface MenuRequest {
  /** Which menu to open. */
  readonly name: ShellMenuName
  /** Viewport x of the button's left edge. */
  readonly x: number
  /** Viewport y of the button's bottom edge. */
  readonly y: number
}

/** What the connect page renders on open. */
export interface BootstrapPayload {
  /** Copy of the active locale. */
  readonly copy: ShellCopy
  /** Address remembered from an earlier launch, when it is still usable. */
  readonly remembered: string | undefined
  /** Localized notice to show above the field, when a previous attempt ended here. */
  readonly notice: string | undefined
}

/** Outcome of one submitted address. */
export type ConnectResult =
  | { readonly ok: true }
  /** The address was refused or the window could not load it; `message` is already localized. */
  | { readonly ok: false; readonly message: string }

/** The surface the preload exposes as `window.remoteShell`. */
export interface RemoteShellBridge {
  /**
   * Read the state the connect page opens with.
   * @returns Copy, remembered address, and any notice.
   */
  bootstrap(): Promise<BootstrapPayload>
  /**
   * Ask the main process to open one address.
   * @param address - Text exactly as typed.
   * @returns Whether the window navigated, or the localized refusal.
   */
  connect(address: string): Promise<ConnectResult>
}
