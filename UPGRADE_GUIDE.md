# OpenTest 升级指南

## 🔄 升级方式

OpenTest 支持多种升级方式，取决于你的安装方法。

## 📦 根据安装方式升级

### 方式 1: npx 用户（推荐，最简单）

如果你使用 `npx open-test` 运行，**自动使用最新版本**：

```bash
# npx 每次都会检查并使用最新版本
npx open-test@latest run

# 强制清除缓存并使用最新版
npx clear-npx-cache
npx open-test@latest run

# 或直接指定版本
npx open-test@2.0.0 run
```

**优势**: 
- ✅ 无需手动升级
- ✅ 总是使用最新版本
- ✅ 不占用本地空间

### 方式 2: 全局安装用户

如果你使用 `npm install -g open-test` 安装：

```bash
# 检查当前版本
open-test --version

# 升级到最新版本
npm update -g open-test

# 或卸载后重新安装
npm uninstall -g open-test
npm install -g open-test@latest

# 升级到特定版本
npm install -g open-test@2.0.0
```

### 方式 3: 项目依赖用户

如果项目中包含 OpenTest：

```bash
# 在项目目录中
npm update open-test

# 或指定版本
npm install open-test@latest

# 使用 npm-check-updates 工具
npx npm-check-updates -u open-test
npm install
```

## 🤖 自动升级检查

OpenTest CLI 会自动检查更新：

```bash
# 运行任何命令时会检查更新
npx open-test run

# 输出示例：
# ╔══════════════════════════════════════════════╗
# ║  🎉 New version available: 2.0.0             ║
# ║  Current: 1.0.0                              ║
# ║  Run: npm update -g open-test                ║
# ╚══════════════════════════════════════════════╝
```

## 📋 检查版本

### 查看当前版本

```bash
# 方式 1: 命令行
open-test --version
# 或
npx open-test --version

# 方式 2: 检查包信息
npm list -g open-test        # 全局安装
npm list open-test           # 项目安装

# 方式 3: 查看 npm registry
npm view open-test version    # 最新版本
npm view open-test versions   # 所有版本
```

### 查看更新历史

```bash
# 查看 CHANGELOG
npx open-test changelog

# 或访问 GitHub
# https://github.com/yourusername/open-test/releases

# 或访问 npm
# https://www.npmjs.com/package/open-test?activeTab=versions
```

## 🔧 升级命令（内置）

OpenTest CLI 提供内置升级命令：

```bash
# 检查更新
npx open-test check-update

# 自动升级（全局安装）
npx open-test upgrade

# 显示版本历史
npx open-test versions

# 显示更新日志
npx open-test changelog
```

## 📊 版本策略

OpenTest 遵循[语义化版本](https://semver.org/)规范：

```
版本格式: MAJOR.MINOR.PATCH
例如: 2.1.3

MAJOR (2.x.x) - 重大更新，可能不兼容
MINOR (x.1.x) - 新功能，向后兼容
PATCH (x.x.3) - Bug 修复，向后兼容
```

### 版本示例

```bash
# Patch 更新 (1.0.0 → 1.0.1)
# - Bug 修复
# - 性能改进
# - 文档更新
# 升级风险: 低 ✅

# Minor 更新 (1.0.0 → 1.1.0)
# - 新功能
# - 新命令
# - 向后兼容
# 升级风险: 低 ✅

# Major 更新 (1.0.0 → 2.0.0)
# - 架构变更
# - 破坏性改动
# - 需要迁移
# 升级风险: 中 ⚠️
```

## 🚨 升级注意事项

### 升级前检查

```bash
# 1. 检查当前版本
open-test --version

# 2. 查看更新日志
npx open-test changelog

# 3. 备份配置（如果有）
cp opentest.config.json opentest.config.json.bak
cp .env .env.bak

# 4. 检查兼容性
npx open-test doctor
```

### 升级后验证

```bash
# 1. 验证版本
open-test --version

# 2. 测试基本功能
open-test doctor
open-test status

# 3. 运行测试
open-test test

# 4. 检查配置
open-test check-config
```

## 🔄 降级（如需要）

如果新版本有问题，可以降级：

```bash
# 全局安装降级
npm install -g open-test@1.0.0

# 项目降级
npm install open-test@1.0.0

# npx 指定旧版本
npx open-test@1.0.0 run
```

## 📝 版本迁移指南

### 从 1.x 升级到 2.x

```bash
# 1. 备份数据
docker compose down
cp -r db/ db.backup/

# 2. 升级
npm update -g open-test

# 3. 运行迁移
open-test migrate --from 1.x --to 2.x

# 4. 验证
open-test doctor
```

### 配置文件迁移

```bash
# 自动迁移配置
open-test migrate-config

# 或手动更新
# 查看新配置格式
open-test config-example > opentest.config.new.json
```

## 🆘 升级故障排查

### 问题 1: 升级后命令不工作

```bash
# 清除 npm 缓存
npm cache clean --force

# 重新安装
npm uninstall -g open-test
npm install -g open-test@latest

# 验证安装
which open-test
open-test --version
```

### 问题 2: 版本不变

```bash
# npx 用户 - 清除缓存
npx clear-npx-cache

# 全局用户 - 检查链接
npm list -g open-test
npm unlink open-test
npm install -g open-test@latest
```

### 问题 3: 服务启动失败

```bash
# 清理旧容器
docker compose down -v
docker system prune -a

# 重新启动
open-test run
```

### 问题 4: 配置不兼容

```bash
# 生成新配置
open-test init --overwrite

# 或使用迁移工具
open-test migrate-config --backup
```

## 💡 最佳实践

### 推荐：使用 npx（总是最新）

```bash
# 优势：
# ✅ 自动使用最新版本
# ✅ 无需手动升级
# ✅ 不占用磁盘空间
# ✅ 多版本并存

# 使用方式：
npx open-test@latest run
```

### 生产环境：锁定版本

```bash
# package.json 中指定版本
{
  "dependencies": {
    "open-test": "2.1.0"  // 精确版本
  }
}

# 或使用版本范围
{
  "dependencies": {
    "open-test": "^2.1.0"  // 允许 patch 更新
  }
}
```

### 开发环境：使用最新版

```bash
# 始终使用 latest tag
{
  "devDependencies": {
    "open-test": "latest"
  }
}
```

## 📢 获取更新通知

### 方式 1: GitHub Watch

```bash
# 访问 GitHub 仓库
https://github.com/yourusername/open-test

# 点击 "Watch" → "Custom" → "Releases"
```

### 方式 2: npm Email 通知

```bash
# 订阅包更新（如果支持）
npm star open-test
```

### 方式 3: RSS Feed

```bash
# GitHub Releases RSS
https://github.com/yourusername/open-test/releases.atom
```

### 方式 4: CLI 自动检查

```bash
# OpenTest 每次运行时检查更新
npx open-test run

# 禁用更新检查
open-test run --no-update-check
```

## 🔗 相关资源

- [版本历史](https://github.com/yourusername/open-test/releases)
- [更新日志](https://github.com/yourusername/open-test/blob/main/CHANGELOG.md)
- [迁移指南](https://github.com/yourusername/open-test/wiki/Migration)
- [问题反馈](https://github.com/yourusername/open-test/issues)

## 📊 版本对照表

| 版本 | 发布日期 | 主要变化 | 升级建议 |
|------|---------|---------|---------|
| 2.0.0 | 2024-XX | V2 架构、Rust 组件 | 推荐 ⚠️ |
| 1.5.0 | 2024-XX | CLI 工具 | 推荐 ✅ |
| 1.0.0 | 2024-XX | MVP 版本 | 稳定 ✅ |

## ❓ 常见问题

### Q: 多久更新一次？

A: 
- **Patch 更新**: 每 1-2 周（Bug 修复）
- **Minor 更新**: 每 1-2 月（新功能）
- **Major 更新**: 每 6-12 月（重大变更）

### Q: 自动更新安全吗？

A: 使用 `npx @latest` 是安全的，因为：
- 所有版本都经过测试
- 遵循语义化版本规范
- 有完整的更新日志
- 支持版本回滚

### Q: 生产环境如何升级？

A: 
1. 在开发/测试环境测试新版本
2. 检查 CHANGELOG 和破坏性变更
3. 备份数据和配置
4. 在低峰期升级
5. 验证所有功能

### Q: 可以跳版本升级吗？

A: 
- **Patch/Minor**: 可以直接跳跃
- **Major**: 建议逐个 Major 版本升级
  - 例如: 1.x → 2.x → 3.x

---

**推荐升级方式**: 使用 `npx open-test@latest` - 零维护，总是最新！ 🚀
