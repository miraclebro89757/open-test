# 录制浏览器

交互式的浏览器选择已经去掉。不再扫描后让人选 Chrome、Edge、Chromium、Brave 或跳过，也不再把选择写进 `~/.opentest/browser.json`，也不再在当前目录生成 `playwright.config.js`。

录制和回放的规则：

1. 本机有 Google Chrome 就用它的可执行文件。
2. 没有再执行包内 Playwright 1.63.0 的 `install chromium`。
3. 官方下载失败，且没有设置 `PLAYWRIGHT_DOWNLOAD_HOST` 时，用 `https://npmmirror.com/mirrors/playwright` 再试一次。

`opentest-ai doctor` 只报告 Node 和将要使用的浏览器。Docker 不属于这次检查。`install`、`run` 和 `browser setup` 做同一次准备。

说明写在 [BROWSER_SETUP.md](../guides/BROWSER_SETUP.md)，命令表在 README。
