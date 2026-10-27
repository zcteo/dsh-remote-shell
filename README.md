---
description: "Electron shell that opens a DeepSeek Harness Web backend you enter yourself, for Linux and Windows; it starts no backend and bundles no dsh runtime."
---

# DeepSeek Harness Remote

English | [中文](README.zh.md)

## Summary

The remote shell is a window onto a `dsh web` deployment that is already running somewhere else. On launch it shows a local connect page; you type the backend address, and the window navigates to it like a browser would. It starts no Host, bundles no dsh runtime, and changes nothing about how the backend authenticates its clients.

## Table of Contents

- [Responsibilities](#responsibilities)
- [Connect to a backend](#connect-to-a-backend)
- [Develop](#develop)
- [Package](#package)
- [Verify a build](#verify-a-build)
- [Known limitations](#known-limitations)

-----

<a id="responsibilities"></a>

## Responsibilities

The shell owns a window, a remembered address, and a native menu. Everything else belongs to the deployment you connect to.

| The shell does | The shell does not |
|---|---|
| Show a local connect page on launch | Start, spawn, or supervise a `dsh web` process |
| Navigate the window to the address you entered | Proxy, rewrite, or intercept backend traffic |
| Reopen the last backend automatically on launch | Store the launch token or any credential itself |
| Draw its own caption bar and menus | Give the backend page a bridge it can call |
| Keep running in the tray after the window closes | Bundle any dsh package or Host capability |
| Report a refused or failed connection in place | Start a second window or a second backend |

Because the window performs an ordinary top-level navigation, the deployment's own launch-token exchange runs exactly as it does in a browser: `dsh web` accepts the token on `GET /`, writes its signed cookie, and redirects. The shell needs no knowledge of that protocol, and a backend behind TLS or `--trusted-host` needs no extra configuration here.

The address is remembered in `backend.json` under the application's user-data directory, and the next launch opens it automatically. It is stored without the launch token, which is a per-process credential that is already dead by then: the window reconnects with the signed session cookie the first connection minted, kept in a persistent `persist:remote-shell` session. That cookie outlives `dsh web` restarts because its signing secret is persisted, so a backend started again on the same authority reopens with no token at all.

A launch with no remembered address, an address the backend no longer answers on, or a backend that refuses the stored cookie all fall back to the connect page with the address pre-filled and a reason above the field. A missing or unreadable settings file counts as no remembered address.

<a id="connect-to-a-backend"></a>

## Connect to a backend

1. Start the backend wherever it belongs: `dsh --profile web`.
2. Launch this application.
3. Paste the URL `dsh web` printed, including the `?token=…` parameter, and choose **Connect**.

Both `http://` and `https://` are accepted, and a bare `host:port` is read as `http://host:port`. An address with any other scheme, an unparseable one, or one carrying a username and password is refused with a reason beside the field.

Once the backend answers, the address is remembered and the window title shows its authority.

The window has no native title bar and no native menu bar. Its window controls come from the platform's title-bar overlay, and its two menus are drawn inside the page's caption strip: **Backend** offers Change Backend (<kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>), Reload Backend (<kbd>Ctrl/Cmd</kbd>+<kbd>R</kbd>), Open, and Exit; **View** offers the usual editing commands. The bar sets `data-windows-titlebar` on the document root when the backend is a dsh Web application, so the application frame reserves the caption row instead of rendering underneath it.

Closing the window does not end the process. The first close explains that, and afterwards the window hides to the tray, where a left click reopens it and **Exit** leaves the application.

<a id="develop"></a>

## Develop

```sh
pnpm run dev
```

Run this once to install dependencies (`pnpm install`), then the command above builds the application and launches the Electron binary this package installed. `pnpm run start` reuses an existing build.

The build emits three programs: `lib/main.js` (the main process, ESM), `lib/preload.cjs` (the sandboxed preload, CommonJS as Electron requires), and `lib/connect/connect.{js,html,css}` (the connect page). Sources live under `src/`, with the page in `src/connect/`.

<a id="package"></a>

## Package

```sh
pnpm run package:linux:x64
pnpm run package:win:x64
```

Artifacts land in `dist/<target>/`. Linux produces an AppImage and a `.deb`; Windows produces an NSIS installer, or — on a host without Wine — the complete unpacked application archived as a zip, because electron-builder runs the generated installer under Wine to finish its resource pass off Windows. Both targets build from either host: the Electron distributions come from `@electron/get` and nothing here needs native compilation.

Packaging downloads the Electron distribution for the target (about 123 MB the first time). A restricted network can set `ELECTRON_MIRROR` to a mirror or `HTTPS_PROXY` to a proxy; the script sets `ELECTRON_GET_USE_PROXY` whenever a proxy variable is present.

Add `--skip-build` to package the current `lib/` unchanged, or `--dir` to emit only the unpacked directory.

<a id="verify-a-build"></a>

## Verify a build

```sh
pnpm run test          # unit tests
pnpm run smoke:page    # render the connect page
E2E_URL='http://127.0.0.1:3080/?token=…' \
  pnpm run smoke:connect   # drive a real backend
```

`smoke:page` loads the built connect page in a real Electron window, reads the rendered text back, and writes a screenshot to `.smoke/`. `smoke:connect` submits a tokenized address through the page's own form and succeeds only when the backend's document replaces the connect page. Both run Electron, so a Linux host needs the libraries Chromium links against — the same ones the `deb` target declares.

<a id="known-limitations"></a>

## Known limitations

- No auto-update, no telemetry, and no account integration.
- The shell keeps one window and one remembered address; it cannot open several backends at once.
- The tray icon requires a desktop environment with a system tray; without one the window still works, but closing it hides the window with no icon to restore it.
- Windows artifacts are unsigned, so SmartScreen warns on first run.
- `linux-arm64` is configured but not part of the checked target set.
