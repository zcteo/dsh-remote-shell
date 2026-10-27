---
description: "手动填写后端地址的 DeepSeek Harness Web 前端壳，适用于 Linux 与 Windows；不启动后端、不打包 dsh 运行时。"
---

# DeepSeek Harness Remote

[English](README.md) | 中文

## 概述

远程壳是开在别处运行的 `dsh web` 之上的一扇窗口。启动时它显示一个本地连接页，你填写后端地址，窗口随后像浏览器一样导航过去。它不启动 Host、不打包 dsh 运行时，也不改变后端如何认证客户端。

## 目录

- [职责边界](#responsibilities)
- [连接后端](#connect-to-a-backend)
- [开发](#develop)
- [打包](#package)
- [发布版本](#publish-a-release)
- [验证构建](#verify-a-build)
- [已知限制](#known-limitations)

-----

<a id="responsibilities"></a>

## 职责边界

壳只拥有一扇窗口、一个记忆的地址和一套原生菜单，其余全部属于你连接的部署。

| 壳会做 | 壳不会做 |
|---|---|
| 启动时显示本地连接页 | 启动、拉起或托管 `dsh web` 进程 |
| 把窗口导航到你填写的地址 | 代理、改写或拦截后端流量 |
| 启动时自动重新打开上次的后端 | 保存启动令牌或任何凭据 |
| 自绘标题栏与菜单 | 给后端页面一个可调用的桥 |
| 窗口关闭后继续驻留托盘 | 打包任何 dsh 包或 Host 能力 |
| 就地报告连接被拒或失败 | 打开第二个窗口或第二个后端 |

由于窗口执行的是普通的顶层导航，部署自己的启动令牌交换会与浏览器中完全一致地发生：`dsh web` 在 `GET /` 上接受令牌、写入签名 Cookie 并重定向。壳无需了解该协议；使用 TLS 或 `--trusted-host` 的后端也无需在此额外配置。

地址保存在应用 user-data 目录下的 `backend.json`，下次启动会自动打开。保存时**不含启动令牌**——那是仅属于单个进程的凭据，到下次启动时早已失效；窗口改用首次连接换来的签名会话 Cookie 重连，该 Cookie 存放在持久的 `persist:remote-shell` 会话中。它的签名密钥是持久化的，因此即使 `dsh web` 重启，只要 authority 不变，无需任何令牌即可重新打开。

没有记忆地址、后端不再响应该地址，或后端拒绝已存的 Cookie 时，都会回落到连接页：地址已预填，字段上方说明原因。设置文件缺失或无法读取视为没有记忆地址。

<a id="connect-to-a-backend"></a>

## 连接后端

1. 在它该在的地方启动后端：`dsh --profile web`。
2. 启动本应用。
3. 粘贴 `dsh web` 打印的 URL（含 `?token=…` 参数），点击 **连接**。

`http://` 与 `https://` 都接受，裸 `host:port` 会按 `http://host:port` 读取。其他 scheme、无法解析的地址，或带用户名密码的地址会被拒绝，并在输入框旁说明原因。

后端响应后地址被记住，窗口标题显示其 authority。

窗口没有原生标题栏，也没有原生菜单栏。窗口控件来自平台的标题栏覆盖层，两个菜单绘制在页面标题条内：**后端** 提供更换后端（<kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>）、重新加载后端（<kbd>Ctrl/Cmd</kbd>+<kbd>R</kbd>）、打开与退出；**视图** 提供常规编辑命令。当后端是 dsh Web 应用时，菜单栏会在文档根节点设置 `data-windows-titlebar`，使应用框架为标题行留出空间，而不是被压在下面。

关闭窗口不会结束进程。首次关闭会说明这一点，之后窗口隐藏到托盘；左键点击托盘可重新打开，选择 **退出** 才会真正结束程序。

<a id="develop"></a>

## 开发

```sh
pnpm run dev
```

先执行一次 `pnpm install` 安装依赖，之后上面的命令会构建应用并启动本包安装的 Electron 二进制。`pnpm run start` 复用已有构建。

构建产出三个程序：`lib/main.js`（主进程，ESM）、`lib/preload.cjs`（沙箱 preload，按 Electron 要求为 CommonJS）、`lib/connect/connect.{js,html,css}`（连接页）。源码位于 `src/`，连接页在 `src/connect/`。

<a id="package"></a>

## 打包

```sh
pnpm run package:linux:x64
pnpm run package:win:x64
```

产物落在 `dist/<target>/`。Linux 产出 AppImage 与 `.deb`。Windows 产出两个：供需要安装的人使用的 NSIS 安装包，以及同一份载荷的 zip，供希望解压即用、或无法运行安装程序的人使用。在非 Windows 主机上 electron-builder 需要用 Wine 完成安装包的资源处理，因此无 Wine 时会跳过安装包，zip 成为唯一的 Windows 产物。

两个目标都能在任一主机上构建：Electron 分发包来自 `@electron/get`，此处没有任何需要本机编译的内容。

打包会下载目标平台的 Electron 分发包（首次约 123 MB）。受限网络可设置 `ELECTRON_MIRROR` 指向镜像，或设置 `HTTPS_PROXY` 指向代理；只要存在代理变量，脚本就会设置 `ELECTRON_GET_USE_PROXY`。

加 `--skip-build` 可在不改动现有 `lib/` 的前提下打包，加 `--dir` 则只产出解包目录。

发布产物命名为 `dsh-remote-shell-<version>-<os>-<arch>.<ext>`；安装后的应用仍显示 **DeepSeek Harness Remote**。

<a id="publish-a-release"></a>

## 发布版本

`.github/workflows/release.yml` 会构建两个平台，并把安装包附加到 GitHub Release。推送 `v*` 标签即可：

```sh
git tag v0.1.0
git push origin v0.1.0
```

构建矩阵运行在 `ubuntu-22.04` 与 `windows-2022`。在 Windows runner 上构建才能产出真正的 NSIS `.exe`：在 Linux 上打包 Windows 会退化为 zip，因为 electron-builder 需要 Wine 完成安装包的资源处理。手动触发 **Release → Run workflow** 会执行同样的构建并把产物上传到本次运行，但不发布 Release。

产物未签名，因此 Windows 安装包首次运行会触发 SmartScreen。要消除该提示需要代码签名证书：在 `electron-builder.config.mjs` 的 `signtoolOptions` 中提供（环境变量如 `WIN_CERT_FILE` 与 `WIN_CERT_PASSWORD`），workflow 会自动签名。

<a id="verify-a-build"></a>

## 验证构建

```sh
pnpm run test          # unit tests
pnpm run smoke:page    # render the connect page
E2E_URL='http://127.0.0.1:3080/?token=…' \
  pnpm run smoke:connect   # drive a real backend
```

`smoke:page` 在真实 Electron 窗口中加载构建后的连接页，读回渲染文本，并把截图写入 `.smoke/`。`smoke:connect` 通过页面自身的表单提交带令牌的地址，只有当后端文档取代连接页时才视为成功。两者都运行 Electron，因此 Linux 主机需要 Chromium 依赖的库 —— 即 `deb` 目标声明的那些。

<a id="known-limitations"></a>

## 已知限制

- 无自动更新、无遥测、无账号集成。
- 壳只保留一扇窗口和一个记忆地址，不能同时打开多个后端。
- 托盘图标需要桌面环境提供系统托盘；没有托盘时窗口仍可用，但关闭后会隐藏且没有图标可唤回。
- Windows 产物未签名，首次运行会触发 SmartScreen 警告。
- 目前只配置 `linux-x64` 与 `win-x64` 两个目标。
