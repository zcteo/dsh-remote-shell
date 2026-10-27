/**
 * Electron Builder configuration for the remote shell.
 *
 * One configuration serves every target: electron-builder selects the `linux`
 * or `win` section from its own `--linux` / `--win` flag, so the packaging
 * script names the platform and this file stays static. Both artifact families
 * are produced from any host, because the Electron distributions come from
 * `@electron/get` and no target needs native compilation of its own.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = fileURLToPath(new URL('.', import.meta.url))

/** Display name of the installed application. */
const PRODUCT_NAME = 'DeepSeek Harness Remote'

export default {
  appId: 'com.deepseek.harness.remoteshell',
  productName: PRODUCT_NAME,
  copyright: 'Copyright © Hangzhou DeepSeek Artificial Intelligence Co., Ltd.',
  directories: {
    app: APP_ROOT,
    output: resolve(APP_ROOT, 'dist'),
    buildResources: resolve(APP_ROOT, 'resources'),
  },
  // Everything the packaged application runs; the type-check output and the
  // sources stay out, and `node_modules` is unnecessary because the only
  // external module is the Electron runtime itself.
  files: ['lib/main.js', 'lib/preload.cjs', 'lib/connect/**/*', 'resources/**/*', 'package.json'],
  asar: true,
  // Icon files are read from disk by Electron at runtime, not by the bundle.
  asarUnpack: ['resources/**/*'],
  // This application has no runtime dependencies to rebuild; its one external
  // module is Electron, which builder supplies.
  npmRebuild: false,
  // Release assets are downloaded and pasted around, so the name avoids the
  // space `productName` carries: a file called `DeepSeek Harness Remote-...`
  // turns into a percent-encoded URL and a shell-quoting problem everywhere it
  // is handled. The installed application keeps the display name.
  artifactName: '${name}-${version}-${os}-${arch}.${ext}',
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'deb', arch: ['x64'] }],
    category: 'Development',
    // A directory of standard sizes: a single oversized PNG installs into a
    // non-standard hicolor bucket that desktop environments do not look up.
    icon: resolve(APP_ROOT, 'resources', 'icons'),
    executableName: 'dsh-remote',
    // Links running windows to this entry in desktop environments that match by
    // WM_CLASS, which Electron reads from the same desktop name.
    syncDesktopName: true,
    synopsis: 'Opens a DeepSeek Harness backend you enter yourself',
    description: 'Electron shell for an already running dsh web deployment. It starts no backend and bundles no dsh runtime.',
  },
  // The libraries Chromium links against on a minimal Debian or Ubuntu host.
  deb: {
    // Debian control metadata requires a maintainer; the application has no
    // packaging channel of its own, so the product owner is named directly.
    maintainer: 'DeepSeek <support@deepseek.com>',
    depends: [
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'libatspi2.0-0',
      'libuuid1',
      'libsecret-1-0',
    ],
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    // builder derives every Windows icon size from this image; 256 is the largest
    // frame the ICO format carries, so a larger source only wastes archive bytes.
    icon: resolve(APP_ROOT, 'resources', 'icon-win.png'),
    executableName: 'dsh-remote',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: PRODUCT_NAME,
  },
}
