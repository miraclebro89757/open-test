# 录制浏览器

录制和回放使用本机的 Google Chrome。没有 Chrome 时，才下载与仓库里 Playwright `1.63.0` 配套的 Chromium。

不会弹出菜单。Edge、Brave、系统 Chromium，以及以前保存在 `~/.opentest/browser.json` 里的选择，都不会被用到。沙箱地址和登录仍然要人来做。

## 准备

```bash
npx opentest-ai doctor
npx opentest-ai install
```

`doctor` 只检查，不下载。它看 Node.js 是否不低于 `22.19.0`，以及本机有没有 Chrome。没有 Chrome 时，它再看配套的 Chromium 是否已经下载。

`install` 做准备：找到 Chrome 就用它；找不到就执行这份 Playwright 的 `install chromium`。官方地址失败时，会再设 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright` 试一次。已经设置过这个变量时，不会改掉。

`npx opentest-ai run` 在打开 Agent 之前做同一次准备。`--skip-browser-setup` 跳过它。在终端里直接运行 `opentest-ai` 会打开 Agent，并且不检查浏览器。

## 查看

```bash
npx opentest-ai browser status
npx opentest-ai browser detect
npx opentest-ai browser verify
```

`status` 和 `detect` 说明录制将使用哪一个浏览器。`verify` 用无头方式打开它并访问 `about:blank`。

`browser setup` 和 `install` 是同一次准备。`--force` 不会改去使用别的浏览器：有 Chrome 时仍然使用 Chrome。

`browser reset` 只删除旧的 `~/.opentest/browser.json`。录制不再读这个文件。

## 没有 Chrome 时

安装 Google Chrome 后再运行 `doctor`，录制就会改用它，不再依赖已下载的 Chromium。

在没有 Chrome 的机器上，`install` 下载约一百多兆的 Chromium。Linux 上如果启动失败，还需要系统库。这一步用 Playwright 自己的 `install-deps`，通常要 sudo。macOS 和 Windows 一般不需要。
