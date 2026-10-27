/**
 * The window's own chrome: a hidden native title bar with an overlay for the
 * platform window controls, plus the geometry the in-window menu bar uses to
 * keep clear of them.
 *
 * The shell draws no native menu bar. Its commands live in the page's menu bar
 * (see `preload-menu.ts`) and in the tray menu, so the window holds only the
 * document — the same arrangement the Desktop application uses.
 */

/** Height of the caption strip, in device-independent pixels. */
export const TITLEBAR_HEIGHT = 40

/**
 * Horizontal space the platform's window controls occupy inside the caption.
 *
 * Windows draws minimize, maximize, and close in the overlay; Linux window
 * managers draw their own buttons and cannot be measured from here, so the
 * region is reserved generously rather than letting the menu sit underneath.
 * @param platform - Value of `process.platform`.
 * @returns The reserved width in device-independent pixels.
 */
export function windowControlsInset(platform: NodeJS.Platform): number {
  return platform === 'darwin' ? 78 : 138
}

/**
 * CSS custom properties that publish the caption geometry to the page.
 * @param platform - Value of `process.platform`.
 * @returns Property names mapped to their CSS values.
 */
export function captionStyle(platform: NodeJS.Platform): Record<string, string> {
  return {
    '--dsh-remote-titlebar-height': `${TITLEBAR_HEIGHT}px`,
    '--dsh-remote-controls-inset': `${windowControlsInset(platform)}px`,
  }
}
