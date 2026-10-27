/**
 * The tray icon: the always-available way back to a hidden window, and the only
 * place the application quits from.
 *
 * Closing the window hides it rather than ending the process, so this icon is
 * what keeps the shell reachable after that. It is created once at startup and
 * lives for the whole run, not only while the window is hidden.
 */

import { Menu, nativeImage, Tray } from 'electron'
import type { ShellCopy } from './locale.ts'

/** Actions the tray triggers; both run the same paths as the in-window menu. */
export interface ShellTrayOptions {
  /** Absolute path of the tray bitmap: the ICO on Windows, the PNG elsewhere. */
  readonly iconPath: string
  /** Copy of the active locale, read on every relabel. */
  readonly copy: () => ShellCopy
  /** Show and focus the window. */
  readonly open: () => void
  /** Leave the application, waiting for the window and tray to be released. */
  readonly quit: () => void
}

/** The tray icon and its context menu. */
export class ShellTray {
  private tray: Tray | undefined

  /** @param options - Icon path, copy reader, and the open and quit actions. */
  constructor(private readonly options: ShellTrayOptions) {
    this.tray = new Tray(nativeImage.createFromPath(options.iconPath))
    // A left click returns to the window, which is what a hidden window's user
    // reaches for first; the menu stays on the right button.
    this.tray.on('click', () => { options.open() })
    this.relabel()
  }

  /** Rebuild the tooltip and context menu in the current locale. */
  relabel(): void {
    const tray = this.tray
    if (tray === undefined) return
    const copy = this.options.copy()
    tray.setToolTip(copy.productName)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: copy.menuOpen, click: () => { this.options.open() } },
      { type: 'separator' },
      { label: copy.menuExit, click: () => { this.options.quit() } },
    ]))
  }

  /** Remove the icon so no dead entry outlives the process. */
  dispose(): void {
    const tray = this.tray
    this.tray = undefined
    tray?.destroy()
  }
}
