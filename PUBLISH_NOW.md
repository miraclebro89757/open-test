# 🚀 立即发布 OpenTest-AI 到 npm

## ✅ 准备工作已完成

- ✅ 包名可用：`opentest-ai`
- ✅ Node 版本要求正确：`>=22.19.0`
- ✅ 所有测试通过：189/189 ✅
- ✅ 文档完善：README.md + README.zh.md
- ✅ package.json 配置正确
- ✅ 包大小合理：125.2 KB
- ✅ 文件清单正确：59个文件

## 📦 发布步骤

### 第一步：登录 npm

```bash
cd /Users/zephyrus/Documents/个人开发/open-test

# 登录 npm（需要 npm 账号）
npm login
```

系统会提示：
1. **Username**: 你的 npm 用户名
2. **Password**: 你的 npm 密码
3. **Email**: 你的邮箱（公开的）
4. **OTP** (可选): 如果启用了两步验证

> 💡 **没有 npm 账号？**
> 访问 https://www.npmjs.com/signup 注册

### 第二步：验证登录

```bash
npm whoami
```

应该显示你的 npm 用户名。

### 第三步：最后检查

```bash
# 确保在正确的目录
pwd
# 应该显示: /Users/zephyrus/Documents/个人开发/open-test

# 再次运行测试
npm test

# 查看将要发布的内容
npm pack --dry-run
```

### 第四步：发布！

```bash
npm publish
```

就这么简单！

## 🎉 发布后验证

### 1. 查看包信息

```bash
npm view opentest-ai
```

### 2. 测试安装

```bash
# 全局安装测试
npm install -g opentest-ai

# 运行测试
opentest-ai --version
opentest-ai doctor

# 测试 Web UI
opentest-ai web --no-open

# 清理（可选）
npm uninstall -g opentest-ai
```

### 3. 使用 npx 测试

```bash
npx opentest-ai@latest --version
npx opentest-ai@latest doctor
```

## 📊 发布信息

| 项目 | 值 |
|------|-----|
| **包名** | `opentest-ai` |
| **版本** | `1.0.0` |
| **大小** | 125.2 KB (unpacked: 414.9 KB) |
| **文件数** | 59 |
| **Node 要求** | >=22.19.0 |
| **许可证** | MIT |
| **作者** | OpenTest Team |

## 🔗 npm 链接

发布后可访问：
- 包主页: https://www.npmjs.com/package/opentest-ai
- 安装命令: `npm install -g opentest-ai`
- npx 命令: `npx opentest-ai@latest`

## 📝 发布后更新文档

发布成功后，更新这些地方的安装说明（已经更新好了）：

- ✅ README.md - 已使用 `npx opentest-ai`
- ✅ README.zh.md - 已使用 `npx opentest-ai`
- ✅ docs/WEB_UI.md - 已使用 `npx opentest-ai web`
- ✅ docs/QUICK_START.md - 已使用 `npx opentest-ai`

## ⚠️ 常见问题

### Q: 发布失败，提示 "You do not have permission"

**A**: 确保：
1. 已经登录：`npm whoami`
2. 包名可用：`npm view opentest-ai`（应该404）
3. package.json 中有 `"publishConfig": {"access": "public"}`

### Q: 发布失败，提示 "version already exists"

**A**: 需要升级版本号：
```bash
# 小版本更新 (1.0.0 -> 1.0.1)
npm version patch

# 功能更新 (1.0.0 -> 1.1.0)
npm version minor

# 重大更新 (1.0.0 -> 2.0.0)
npm version major

# 然后再次发布
npm publish
```

### Q: 想撤回发布怎么办？

**A**: 发布后72小时内可以撤回：
```bash
npm unpublish opentest-ai@1.0.0
```

⚠️ 注意：撤回后该版本号不能再次使用

## 🎯 发布清单

在运行 `npm publish` 前确认：

- ✅ 已登录 npm：`npm whoami` 有输出
- ✅ 测试全部通过：`npm test` 全绿
- ✅ 版本号正确：检查 package.json
- ✅ 文档已更新：README、CHANGELOG
- ✅ Git 已提交：`git status` 干净
- ✅ Git 已推送：`git push origin main`
- ✅ 包内容正确：`npm pack --dry-run`

## 🚀 快速发布脚本

如果一切准备就绪，可以用这个一键脚本：

```bash
#!/bin/bash
set -e

echo "🚀 开始发布 opentest-ai..."

# 1. 检查登录
echo "1️⃣ 检查 npm 登录状态..."
npm whoami || { echo "❌ 请先运行 npm login"; exit 1; }

# 2. 运行测试
echo "2️⃣ 运行测试..."
npm test || { echo "❌ 测试失败"; exit 1; }

# 3. 检查包内容
echo "3️⃣ 检查包内容..."
npm pack --dry-run

# 4. 确认发布
echo "4️⃣ 准备发布..."
read -p "确认发布 opentest-ai@1.0.0? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    npm publish
    echo "✅ 发布成功！"
    echo "🔗 查看: https://www.npmjs.com/package/opentest-ai"
else
    echo "❌ 取消发布"
    exit 1
fi
```

保存为 `publish.sh`，然后：
```bash
chmod +x publish.sh
./publish.sh
```

## 🎉 发布后的下一步

1. **在 README 中添加 npm 徽章**（已添加）
   ```markdown
   [![npm version](https://img.shields.io/npm/v/opentest-ai.svg)](https://www.npmjs.com/package/opentest-ai)
   ```

2. **发布 GitHub Release**
   - 访问：https://github.com/miraclebro89757/open-test/releases/new
   - Tag: `v1.0.0`
   - Title: `OpenTest AI v1.0.0`
   - 描述：复制 CHANGELOG 内容

3. **宣传**
   - 发推文/微博
   - 发到相关技术社区
   - 更新个人简历/作品集

4. **监控**
   - 下载量：https://npmcharts.com/compare/opentest-ai
   - Issues: https://github.com/miraclebro89757/open-test/issues
   - npm 页面：https://www.npmjs.com/package/opentest-ai

---

## 现在就开始发布！

```bash
cd /Users/zephyrus/Documents/个人开发/open-test
npm login
npm publish
```

🚀 Good luck!
