# OpenTest 升级快速参考

## ⚡ 最快升级方式

### npx 用户（推荐）

```bash
# 自动使用最新版本 - 无需任何操作！
npx open-test@latest run
```

**优势**: 总是最新，零维护 ✅

### 全局安装用户

```bash
# 方式 1: 使用内置命令
npx open-test upgrade

# 方式 2: 使用 npm
npm update -g open-test

# 验证版本
open-test --version
```

### 项目依赖用户

```bash
npm update open-test
```

## 🔍 检查更新

```bash
# 检查是否有新版本
npx open-test update

# 完整系统检查（包含版本）
npx open-test doctor

# 查看当前版本
npx open-test --version
```

## 🤖 自动更新检查

OpenTest 会在运行时自动检查更新：

```bash
npx open-test run

# 如果有更新，会显示：
# ╔══════════════════════════════════════════════╗
# ║  🎉 New version available: 2.0.0             ║
# ║  Current: 1.0.0                              ║
# ║  Run: npm update -g open-test                ║
# ╚══════════════════════════════════════════════╝
```

禁用更新检查：

```bash
npx open-test run --no-update-check
```

## 📊 版本信息

```bash
# 当前版本
open-test --version

# 查看 npm 最新版本
npm view open-test version

# 查看所有可用版本
npm view open-test versions

# 查看更新日志
open-test changelog
```

## 🔄 版本管理

### 使用特定版本

```bash
# 全局安装特定版本
npm install -g open-test@2.0.0

# npx 使用特定版本
npx open-test@2.0.0 run

# 项目依赖指定版本
npm install open-test@2.0.0
```

### 降级（如需要）

```bash
# 安装旧版本
npm install -g open-test@1.0.0

# 或用 npx
npx open-test@1.0.0 run
```

## 📝 CLI 升级命令

| 命令 | 功能 |
|------|------|
| `open-test update` | 检查是否有更新 |
| `open-test upgrade` | 升级到最新版本（全局安装） |
| `open-test doctor` | 健康检查（包含版本信息） |
| `open-test changelog` | 查看更新日志链接 |
| `open-test --version` | 显示当前版本 |

## 🚨 升级注意事项

### 升级前

```bash
# 1. 备份配置
cp opentest.config.json opentest.config.json.bak
cp .env .env.bak

# 2. 停止服务
open-test stop

# 3. 检查更新日志
open-test changelog
```

### 升级后

```bash
# 1. 验证版本
open-test --version

# 2. 健康检查
open-test doctor

# 3. 测试运行
open-test run
```

## 💡 最佳实践

### 🌟 推荐：使用 npx（零维护）

```bash
# 优势：
# ✅ 总是使用最新版本
# ✅ 无需手动升级
# ✅ 不占用磁盘空间
# ✅ 多版本并存

npx open-test@latest run
```

### 🏢 生产环境：锁定版本

```json
{
  "dependencies": {
    "open-test": "2.1.0"  // 精确版本
  }
}
```

### 🔧 开发环境：使用 latest

```json
{
  "devDependencies": {
    "open-test": "latest"  // 总是最新
  }
}
```

## 🆘 故障排查

### 版本不变

```bash
# 清除缓存
npm cache clean --force

# 重新安装
npm uninstall -g open-test
npm install -g open-test@latest
```

### npx 缓存问题

```bash
# 清除 npx 缓存
npx clear-npx-cache

# 再次运行
npx open-test@latest run
```

### 升级失败

```bash
# 使用 npx（总是最新）
npx open-test@latest run

# 无需本地安装！
```

## 📦 安装方式对比

| 方式 | 命令 | 升级 | 推荐度 |
|------|------|------|--------|
| **npx** | `npx open-test@latest run` | 自动 | ⭐⭐⭐⭐⭐ |
| 全局安装 | `npm install -g open-test` | 手动 | ⭐⭐⭐ |
| 项目依赖 | `npm install open-test` | 手动 | ⭐⭐⭐ |

## 🔗 相关资源

- **完整升级指南**: [UPGRADE_GUIDE.md](./UPGRADE_GUIDE.md)
- **CLI 文档**: [CLI_README.md](./CLI_README.md)
- **发布历史**: https://github.com/yourusername/open-test/releases
- **npm 页面**: https://www.npmjs.com/package/open-test

---

**记住**: 使用 `npx open-test@latest run` 永远是最简单的方式！ 🚀
