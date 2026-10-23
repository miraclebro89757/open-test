# 录制浏览器检查

当前行为见 [BROWSER_SETUP.md](BROWSER_SETUP.md)。没有选择菜单。

```bash
npx opentest-ai doctor
npx opentest-ai browser detect
npx opentest-ai browser verify
```

有 Google Chrome 时，这三步都不下载浏览器，`doctor` 和 `detect` 打出 Chrome 的路径。

没有 Chrome 时：

```bash
npx opentest-ai install
npx opentest-ai browser verify
```

`install` 下载 Playwright 1.63.0 的 Chromium。官方地址失败时再试 npmmirror。

`npx opentest-ai run --skip-browser-setup` 打开 Agent 并且不做这次检查。不带这个参数时，`run` 和 `install` 做同一次准备。

`npx opentest-ai browser reset` 只删除旧的 `~/.opentest/browser.json`。录制不读它。
