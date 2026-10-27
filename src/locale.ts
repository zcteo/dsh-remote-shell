/**
 * Typed copy for the shell's own interface.
 *
 * The connect page and the native menu show the same strings, so both read one
 * dictionary rather than each carrying its own literals. A locale the shell
 * does not translate falls back to English rather than showing a missing key.
 */

import type { BackendUrlRejection } from './backend-url.ts'

/** Locales the shell ships translated copy for. */
export type ShellLocale = 'en' | 'zh'

/** Every user-visible string the shell owns. */
export interface ShellCopy {
  /** Window title of the connect page. */
  readonly connectTitle: string
  /** Heading above the address field. */
  readonly connectHeading: string
  /** Paragraph explaining what the shell does not do. */
  readonly connectDescription: string
  /** Label of the address field. */
  readonly addressLabel: string
  /** Placeholder showing the expected address form. */
  readonly addressPlaceholder: string
  /** Submit button. */
  readonly connectAction: string
  /** Hint below the field. */
  readonly addressHint: string
  /** Address field was empty. */
  readonly errorEmpty: string
  /** Address was not parseable. */
  readonly errorMalformed: string
  /** Address used a scheme other than HTTP or HTTPS. */
  readonly errorScheme: string
  /** Address embedded credentials. */
  readonly errorCredentials: string
  /** The address was valid but the window could not open it. */
  readonly errorRefused: string
  /** The remembered backend could not be reopened on launch. */
  readonly reconnectFailed: string
  /** The remembered address will be used again on the next launch. */
  readonly autoConnectHint: string
  /** The remembered settings file could not be read. */
  readonly warningUnreadable: string
  /** The connect page opened outside the shell, so no bridge is available. */
  readonly errorNoBridge: string
  /** Dialog title when the build output the application needs is missing. */
  readonly missingBuildTitle: string
  /** Dialog body naming the missing artifact and the command that produces it. */
  readonly missingBuildDetail: string
  /** Menu item returning to the connect page. */
  readonly menuChangeBackend: string
  /** Menu item reloading the open backend. */
  readonly menuReload: string
  /** Menu item for the application menu on macOS. */
  readonly menuQuit: string
  /** Menu title holding the backend navigation commands. */
  readonly menuBackend: string
  /** Menu title holding the browser-style view commands. */
  readonly menuView: string
  /** Accessible name of the in-window menu bar. */
  readonly menuBarLabel: string
  /** App menu item that shows and focuses the window from the tray. */
  readonly menuOpen: string
  /** App menu item that leaves the application entirely. */
  readonly menuExit: string
  /** Edit menu item that undoes the last editor change. */
  readonly menuUndo: string
  /** Edit menu item that redoes an undone change. */
  readonly menuRedo: string
  /** Edit menu item that cuts the selection. */
  readonly menuCut: string
  /** Edit menu item that copies the selection. */
  readonly menuCopy: string
  /** Edit menu item that pastes the clipboard. */
  readonly menuPaste: string
  /** Edit menu item that selects everything in the editor. */
  readonly menuSelectAll: string
  /** Tray tooltip and window title suffix. */
  readonly productName: string
  /** One-time notice explaining that closing hides the window. */
  readonly backgroundNoticeBody: string
  /** Button acknowledging the background notice. */
  readonly backgroundNoticeConfirm: string
}

/** English copy, also the fallback for any untranslated locale. */
const EN: ShellCopy = {
  connectTitle: 'DeepSeek Harness',
  connectHeading: 'Connect to a DeepSeek Harness backend',
  connectDescription: 'Enter the address of a running dsh web deployment. This shell opens that page in its own window and starts no backend of its own.',
  addressLabel: 'Backend address',
  addressPlaceholder: 'http://127.0.0.1:3080/?token=…',
  connectAction: 'Connect',
  addressHint: 'Include the launch token from the URL that dsh web printed.',
  errorEmpty: 'Enter a backend address.',
  errorMalformed: 'That address is not a valid URL.',
  errorScheme: 'Only http and https addresses are supported.',
  errorCredentials: 'Remove the username and password from the address.',
  errorRefused: 'The window could not open that address.',
  reconnectFailed: 'The remembered backend could not be reopened. Check that it is running, then paste a new address from its output.',
  autoConnectHint: 'The last backend you connected to opens automatically on launch.',
  warningUnreadable: 'The saved address could not be read and was ignored.',
  errorNoBridge: 'This page must run inside the remote shell application.',
  missingBuildTitle: 'The remote shell is not built.',
  missingBuildDetail: 'Run `pnpm run build` in apps/remote-shell, then launch again.',
  menuChangeBackend: 'Change Backend…',
  menuReload: 'Reload Backend',
  menuQuit: 'Quit',
  menuBackend: 'Backend',
  menuView: 'View',
  menuBarLabel: 'Application menu',
  menuOpen: 'Open DeepSeek Harness Remote',
  menuExit: 'Exit',
  menuUndo: 'Undo',
  menuRedo: 'Redo',
  menuCut: 'Cut',
  menuCopy: 'Copy',
  menuPaste: 'Paste',
  menuSelectAll: 'Select All',
  productName: 'DeepSeek Harness Remote',
  backgroundNoticeBody: 'The window is hidden and keeps running in the system tray. Reopen it from the tray icon; choose Exit there to quit.',
  backgroundNoticeConfirm: 'OK',
}

/** Chinese copy of the same keys. */
const ZH: ShellCopy = {
  connectTitle: 'DeepSeek Harness',
  connectHeading: '连接 DeepSeek Harness 后端',
  connectDescription: '填写一个已运行的 dsh web 地址。本程序只在自己的窗口中打开该页面，不会自行启动后端。',
  addressLabel: '后端地址',
  addressPlaceholder: 'http://127.0.0.1:3080/?token=…',
  connectAction: '连接',
  addressHint: '请带上 dsh web 启动时打印的 URL 中的启动令牌。',
  errorEmpty: '请填写后端地址。',
  errorMalformed: '该地址不是合法的 URL。',
  errorScheme: '只支持 http 和 https 地址。',
  errorCredentials: '请去掉地址中的用户名和密码。',
  errorRefused: '无法打开该地址的窗口。',
  reconnectFailed: '无法重新打开上次的后端。请确认它正在运行，并粘贴它输出的新地址。',
  autoConnectHint: '启动时会自动打开上次连接的后端。',
  warningUnreadable: '保存的地址无法读取，已忽略。',
  errorNoBridge: '本页面必须在远程壳应用内运行。',
  missingBuildTitle: '远程壳尚未构建。',
  missingBuildDetail: '请在 apps/remote-shell 执行 `pnpm run build` 后重新启动。',
  menuChangeBackend: '更换后端…',
  menuReload: '重新加载后端',
  menuQuit: '退出',
  menuBackend: '后端',
  menuView: '视图',
  menuBarLabel: '应用菜单',
  menuOpen: '打开 DeepSeek Harness Remote',
  menuExit: '退出',
  menuUndo: '撤销',
  menuRedo: '重做',
  menuCut: '剪切',
  menuCopy: '复制',
  menuPaste: '粘贴',
  menuSelectAll: '全选',
  productName: 'DeepSeek Harness Remote',
  backgroundNoticeBody: '窗口已隐藏，程序继续在系统托盘运行。可从托盘图标重新打开窗口，选择退出即可完全关闭。',
  backgroundNoticeConfirm: '知道了',
}

const DICTIONARIES: Readonly<Record<ShellLocale, ShellCopy>> = { en: EN, zh: ZH }

/**
 * Resolve the copy of one locale.
 * @param locale - Locale tag, such as Electron's `app.getLocale()` result.
 * @returns The matching dictionary, or English for any other tag.
 */
export function copyFor(locale: string): ShellCopy {
  const normalized = locale.toLowerCase()
  return normalized.startsWith('zh') ? DICTIONARIES.zh : DICTIONARIES.en
}

/**
 * One localized sentence per parser rejection. The record key type is the closed
 * rejection union, so adding a reason without its copy fails to compile instead
 * of leaving an unreachable arm or an empty line on the page.
 */
const REJECTION_COPY: Readonly<Record<BackendUrlRejection, (copy: ShellCopy) => string>> = {
  empty: copy => copy.errorEmpty,
  malformed: copy => copy.errorMalformed,
  scheme: copy => copy.errorScheme,
  credentials: copy => copy.errorCredentials,
}

/**
 * Map a rejection the parser reported onto its localized sentence.
 * @param copy - Dictionary of the active locale.
 * @param reason - Rejection the parser returned.
 * @returns The sentence to show beside the address field.
 */
export function rejectionMessage(copy: ShellCopy, reason: BackendUrlRejection): string {
  return REJECTION_COPY[reason](copy)
}
