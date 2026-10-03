# 浏览器环境配置指南

OpenTest 的录制功能需要浏览器环境支持。本文档介绍如何配置浏览器环境。

## 🎯 概述

OpenTest 支持三种浏览器配置方式：

1. **系统浏览器**（推荐）- 使用您已安装的 Chrome/Edge/Chromium
2. **Playwright Chromium** - 下载专用测试浏览器
3. **稍后配置** - 跳过录制功能，使用其他测试功能

## 🚀 快速开始

### 首次运行自动配置

首次运行 OpenTest 时，会自动引导您配置浏览器：

```bash
npx open-test run
```

系统会：
1. 检测您的环境（操作系统、Node.js 版本）
2. 扫描已安装的浏览器（Chrome、Edge、Chromium 等）
3. 显示配置选项供您选择

### 手动配置

如果跳过了首次配置，可以随时运行：

```bash
npx open-test browser setup
```

强制重新配置：

```bash
npx open-test browser setup --force
```

## 📋 配置选项详解

### 选项 1：使用系统浏览器（推荐）

**优点：**
- ✅ 无需下载，立即可用
- ✅ 使用您熟悉的浏览器
- ✅ 零额外磁盘占用

**要求：**
- 已安装 Chrome、Edge 或 Chromium

**支持的浏览器：**
- Google Chrome (推荐)
- Microsoft Edge
- Chromium
- Brave Browser

配置时，OpenTest 会：
1. 自动检测浏览器安装路径
2. 验证浏览器可以正常启动
3. 生成 `playwright.config.js` 配置文件

### 选项 2：安装 Playwright Chromium

**优点：**
- ✅ 专用测试浏览器
- ✅ 完全兼容 Playwright API
- ✅ 版本稳定

**要求：**
- 下载大小：~120 MB
- 磁盘占用：~280 MB
- 安装时间：2-5 分钟

配置时，OpenTest 会：
1. 运行 `npx playwright install chromium`
2. 下载并安装 Chromium
3. 验证安装成功

### 选项 3：稍后配置

如果暂时不需要录制功能，可以选择跳过。

跳过后仍可使用的功能：
- ✅ 需求分析
- ✅ 用例生成
- ✅ Bug 分析
- ✅ 测试报告
- ❌ UI 录制
- ❌ API 录制

## 🛠 命令行工具

### 查看配置状态

```bash
npx open-test browser status
```

显示当前浏览器配置详情。

### 验证配置

```bash
npx open-test browser verify
```

验证浏览器是否可以正常启动。

### 检测浏览器

```bash
npx open-test browser detect
```

扫描并显示系统中所有可用的浏览器。

### 重置配置

```bash
npx open-test browser reset
```

清除浏览器配置，回到初始状态。

### 系统健康检查

```bash
npx open-test doctor
```

全面检查系统状态，包括：
- 版本信息
- 系统依赖
- 浏览器环境

## 📂 配置文件

### 浏览器配置

配置保存在：`~/.opentest/browser.json`

示例（系统浏览器）：
```json
{
  "configured": true,
  "type": "system",
  "browser": {
    "name": "Chrome",
    "type": "chrome",
    "path": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "version": "131.0.6778.85",
    "channel": "stable"
  },
  "configuredAt": "2026-10-03T10:30:00.000Z"
}
```

示例（Playwright）：
```json
{
  "configured": true,
  "type": "playwright",
  "browser": {
    "name": "Playwright Chromium",
    "type": "chromium",
    "version": "1.48.0"
  },
  "configuredAt": "2026-10-03T10:30:00.000Z"
}
```

### Playwright 配置

自动生成的 `playwright.config.js`：

```javascript
// 系统浏览器
module.exports = {
  use: {
    channel: 'chrome', // 使用系统 Chrome
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
};
```

## 🔧 高级配置

### 指定浏览器路径

如果自动检测失败，可以手动编辑 `playwright.config.js`：

```javascript
module.exports = {
  use: {
    executablePath: '/path/to/your/browser',
    // ... 其他配置
  },
};
```

### 多浏览器支持

在项目中可以配置多个浏览器进行测试：

```javascript
module.exports = {
  projects: [
    {
      name: 'chromium',
      use: { channel: 'chrome' },
    },
    {
      name: 'edge',
      use: { channel: 'msedge' },
    },
  ],
};
```

### 无头模式

录制时自动使用有头模式（`headless: false`），运行测试时可改为无头模式以提升性能：

```javascript
module.exports = {
  use: {
    headless: true, // 无头模式
  },
};
```

## ❓ 常见问题

### Q: 为什么推荐使用系统浏览器？

A: 系统浏览器的优势：
- 无需下载，节省时间和带宽
- 与日常使用的浏览器一致
- 录制的脚本更接近真实用户环境

### Q: Playwright Chromium 和系统 Chrome 有什么区别？

A: 
- **Playwright Chromium**: 专门为自动化测试优化，版本固定，完全兼容
- **系统 Chrome**: 常规浏览器，版本可能更新，功能更完整

两者在录制和回放功能上几乎没有区别。

### Q: 可以同时使用系统浏览器和 Playwright Chromium 吗？

A: 可以。配置时选择一个作为默认浏览器，需要时可以在 `playwright.config.js` 中配置多个项目。

### Q: 验证失败怎么办？

A: 尝试以下步骤：
1. 确保浏览器已正确安装
2. 运行 `npx open-test browser detect` 检查检测结果
3. 尝试 `npx open-test browser setup --force` 重新配置
4. 如果问题持续，尝试安装 Playwright Chromium

### Q: 如何切换浏览器？

A: 运行 `npx open-test browser setup --force` 重新选择。

### Q: 配置会影响其他项目吗？

A: 不会。浏览器配置存储在用户目录（`~/.opentest/`），但每个项目可以有自己的 `playwright.config.js` 覆盖默认配置。

### Q: 可以跳过配置直接使用吗？

A: 可以。使用 `--skip-browser-setup` 参数：

```bash
npx open-test run --skip-browser-setup
```

但这样无法使用录制功能。

## 📚 相关文档

- [Playwright 官方文档](https://playwright.dev/)
- [Playwright 浏览器配置](https://playwright.dev/docs/browsers)
- [OpenTest README](./README.md)

## 🆘 获取帮助

如果遇到问题：

1. 运行 `npx open-test doctor` 检查系统状态
2. 查看 [Issues](https://github.com/miraclebro89757/open-test/issues)
3. 提交新的 Issue

---

**提示**: 首次配置推荐选择"使用系统浏览器"，简单快捷！ 🚀
