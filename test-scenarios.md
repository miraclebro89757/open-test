# OpenTest 浏览器配置测试场景

## 🎯 测试目标

验证首次启动 OpenTest 时的浏览器配置引导流程。

## 📋 测试前准备

### 检查工具 - test-first-run.js

```bash
# 1. 检测当前环境和配置状态
node test-first-run.js detect

# 2. 查看配置状态
node test-first-run.js status

# 3. 重置配置（模拟首次运行）
node test-first-run.js reset

# 4. 体验配置流程
node test-first-run.js setup
```

## 🧪 测试场景

### 场景 1: 首次完整启动（有系统浏览器）

**前置条件：**
- 已安装 Chrome/Edge/Chromium
- 未配置过浏览器环境

**测试步骤：**

```bash
# 1. 确保是首次运行状态
node test-first-run.js reset

# 2. 启动 OpenTest
npx open-test run

# 预期结果：
# - 显示欢迎界面
# - 检测到系统浏览器
# - 显示配置选项：
#   ● 使用系统 Chrome (推荐)
#   ○ 安装 Playwright Chromium  
#   ○ 稍后配置
```

**操作：**
- 选择 "使用系统 Chrome"
- 等待验证完成
- 查看是否提示 "配置完成"

**验证：**
```bash
# 验证配置已保存
node test-first-run.js status

# 或使用命令
npx open-test browser status
```

---

### 场景 2: 首次启动选择 Playwright

**前置条件：**
- 未配置过浏览器环境
- （可选）没有系统浏览器

**测试步骤：**

```bash
# 1. 重置配置
node test-first-run.js reset

# 2. 启动配置
node test-first-run.js setup

# 或
npx open-test browser setup
```

**操作：**
- 选择 "安装 Playwright Chromium"
- 确认下载（~120MB）
- 等待下载和安装
- 验证成功

**注意：** 这个过程可能需要 2-5 分钟

---

### 场景 3: 首次启动选择跳过

**测试步骤：**

```bash
# 1. 重置配置
node test-first-run.js reset

# 2. 启动配置
node test-first-run.js setup
```

**操作：**
- 选择 "稍后配置"
- 确认跳过

**验证：**
```bash
# 配置类型应为 "none"
node test-first-run.js status
```

**后续：**
```bash
# 可以随时重新配置
npx open-test browser setup
```

---

### 场景 4: 跳过浏览器配置直接启动

**测试步骤：**

```bash
# 1. 重置配置
node test-first-run.js reset

# 2. 跳过配置直接启动
npx open-test run --skip-browser-setup

# 预期结果：
# - 不显示浏览器配置界面
# - 直接进入 Agent
```

---

### 场景 5: 已配置后再次启动

**测试步骤：**

```bash
# 1. 确保已配置
node test-first-run.js status

# 2. 正常启动
npx open-test run

# 预期结果：
# - 不显示配置界面
# - 直接进入 Agent
# - 显示一行提示：✓ 浏览器环境: Chrome
```

---

### 场景 6: 强制重新配置

**测试步骤：**

```bash
# 查看当前配置
npx open-test browser status

# 强制重新配置
npx open-test browser setup --force

# 预期结果：
# - 显示完整配置流程
# - 可以选择不同的浏览器
```

---

### 场景 7: 验证浏览器配置

**测试步骤：**

```bash
# 验证当前配置的浏览器是否可用
npx open-test browser verify

# 预期结果：
# - 成功：显示 ✅ 浏览器验证成功
# - 失败：显示错误信息和解决建议
```

---

### 场景 8: 检测所有浏览器

**测试步骤：**

```bash
# 检测系统中所有可用浏览器
npx open-test browser detect

# 预期结果：
# - 列出所有检测到的浏览器
# - 显示版本和路径
# - 标记推荐的浏览器
```

---

### 场景 9: 系统健康检查

**测试步骤：**

```bash
# 完整的系统检查
npx open-test doctor

# 预期结果：
# - 版本信息
# - 系统依赖
# - 浏览器环境状态
# - 检测到的可用浏览器
```

---

## 🔍 快速测试流程

### 最小化测试（5 分钟）

```bash
# 1. 检测环境
node test-first-run.js detect

# 2. 重置配置（模拟首次运行）
node test-first-run.js reset

# 3. 体验配置流程（选择系统浏览器，最快）
node test-first-run.js setup

# 4. 验证配置
npx open-test browser status

# 5. 验证浏览器
npx open-test browser verify

# 6. 测试实际启动
npx open-test run
```

### 完整测试（15 分钟）

按顺序执行场景 1-9，覆盖所有功能。

---

## 📝 测试检查清单

### 用户体验
- [ ] 欢迎界面清晰友好
- [ ] 环境检测信息完整
- [ ] 选项说明易懂
- [ ] 进度反馈及时
- [ ] 成功/失败提示明确
- [ ] 错误信息有帮助

### 功能正确性
- [ ] 能检测到系统浏览器
- [ ] 能检测到 Playwright 浏览器
- [ ] 配置能正确保存
- [ ] 配置能正确读取
- [ ] 浏览器验证正常工作
- [ ] 跳过选项正常工作
- [ ] 强制重新配置正常工作

### 边界情况
- [ ] 没有系统浏览器时的处理
- [ ] 浏览器验证失败时的处理
- [ ] 取消配置的处理
- [ ] 重复配置的处理
- [ ] 配置文件损坏的处理

---

## 🐛 已知问题和注意事项

### 注意事项

1. **Playwright 安装时间**
   - 首次安装需要下载 ~120MB
   - 可能需要 2-5 分钟
   - 需要稳定的网络连接

2. **系统浏览器版本**
   - 建议使用最新版本的 Chrome/Edge
   - 旧版本可能存在兼容性问题

3. **权限问题**
   - macOS 可能需要授权浏览器访问权限
   - 首次启动可能会弹出权限确认

### 故障排除

**问题：检测不到系统浏览器**
```bash
# 1. 手动检查浏览器路径
ls -la "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 2. 查看详细检测结果
node test-first-run.js detect

# 3. 尝试 Playwright 浏览器
npx open-test browser setup
# 选择 "安装 Playwright Chromium"
```

**问题：验证失败**
```bash
# 1. 查看错误信息
npx open-test browser verify

# 2. 重新配置
npx open-test browser setup --force

# 3. 查看系统健康状态
npx open-test doctor
```

**问题：配置文件损坏**
```bash
# 1. 查看配置文件
cat ~/.opentest/browser.json

# 2. 重置配置
npx open-test browser reset

# 3. 重新配置
npx open-test browser setup
```

---

## 📸 预期截图位置

### 配置界面
1. 欢迎界面
2. 环境检测结果
3. 配置选项列表
4. 验证成功提示
5. 配置完成提示

### 命令输出
1. `browser status` 输出
2. `browser detect` 输出
3. `browser verify` 成功输出
4. `browser verify` 失败输出
5. `doctor` 完整输出

---

## ✅ 验收标准

### 必须通过
- [x] 首次启动能正确检测环境
- [x] 能显示友好的配置界面
- [x] 能成功配置系统浏览器
- [x] 能成功配置 Playwright 浏览器
- [x] 配置能正确保存和读取
- [x] 所有命令正常工作
- [x] 所有测试通过

### 体验优化
- [x] 界面清晰友好
- [x] 进度反馈及时
- [x] 错误提示有帮助
- [x] 文档完整准确

---

**测试日期**: 2026-10-04  
**测试人**: _________  
**测试结果**: [ ] 通过 / [ ] 失败  
**备注**: _________________________________________
