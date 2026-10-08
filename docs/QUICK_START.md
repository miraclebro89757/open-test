# OpenTest 快速开始

## 🚀 首次使用

### 1. 修复 LLM 配置（重要！）

如果遇到 `404: No endpoints found for stealth/space-bunny-alpha` 错误，说明 LLM 配置有问题。

#### 快速修复方案：

```bash
# 方案 1: 使用修复脚本（推荐）
./fix-pi-model.sh

# 方案 2: 使用配置向导
node cli/commands/llm-config.js

# 方案 3: 手动创建配置（临时免费）
cat > ~/.opentest/models.json <<'EOF'
{
  "active_profile": "free",
  "profiles": {
    "free": {
      "provider": "openrouter",
      "model": "google/gemini-2.0-flash-exp:free",
      "apiKey": "ollama-no-key-required",
      "baseUrl": "https://openrouter.ai/api/v1"
    }
  },
  "failover_order": ["free"]
}
EOF
```

#### 推荐配置（长期使用）：

**DeepSeek（性价比最高）**：
```json
{
  "active_profile": "deepseek",
  "profiles": {
    "deepseek": {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "apiKey": "your-api-key-here",
      "baseUrl": "https://api.deepseek.com/v1"
    }
  },
  "failover_order": ["deepseek"]
}
```

获取 API Key: https://platform.deepseek.com/

### 2. 验证配置

```bash
# 诊断 LLM 配置
node diagnose-llm.js

# 查看当前配置
node cli/commands/llm-config.js show
```

期望输出：
```
✅ LLM Client 创建成功
   - Active Profile: deepseek (或其他配置的 profile)
```

### 3. 启动 Agent

```bash
npx pi
```

### 4. 使用 /explore

在 Agent 中：

```
# 选择项目（首次使用）
/project

# 智能探索
/explore
```

## 📋 常见问题

### Q: 为什么会报 404 错误？

**A**: 这是因为 LLM 配置中的模型不存在或不可用。

常见原因：
1. `~/.opentest/models.json` 中配置了不存在的模型
2. API Key 无效或过期
3. 模型名称拼写错误

**解决方案**：
```bash
# 删除旧配置
rm ~/.opentest/models.json

# 重新配置
node cli/commands/llm-config.js
```

### Q: 如何使用免费模型？

**A**: OpenRouter 提供免费模型：

```bash
cat > ~/.opentest/models.json <<'EOF'
{
  "active_profile": "free",
  "profiles": {
    "free": {
      "provider": "openrouter",
      "model": "google/gemini-2.0-flash-exp:free",
      "apiKey": "ollama-no-key-required"
    }
  }
}
EOF
```

### Q: 如何完全本地运行（不需要 API Key）？

**A**: 使用 Ollama：

```bash
# 1. 安装 Ollama
brew install ollama

# 2. 下载模型
ollama pull qwen2.5:14b

# 3. 启动 Ollama
ollama serve

# 4. 配置 OpenTest
cat > ~/.opentest/models.json <<'EOF'
{
  "active_profile": "ollama",
  "profiles": {
    "ollama": {
      "provider": "ollama",
      "model": "qwen2.5:14b",
      "apiKey": "ollama-no-key-required",
      "baseUrl": "http://localhost:11434/v1"
    }
  }
}
EOF
```

### Q: /explore 命令没有补全？

**A**: 确保使用最新版本：

```bash
git pull origin main
npm install
```

然后重新启动 Agent。

### Q: Agent 说找不到 explore_and_generate 工具？

**A**: 工具已注册，但可能需要重启 Agent：

```bash
# 退出当前 Agent (Ctrl+C 或 /exit)

# 重新启动
npx pi
```

## 🎯 完整工作流程

### 场景：测试登录功能

```bash
# 1. 启动 Agent
npx pi

# 2. 选择项目
/project
# 输入项目路径：~/Desktop/my-project

# 3. 智能探索
/explore

# Agent 会：
# - 自动解析 sandbox URL（或提示你输入）
# - 启动浏览器

# 4. 你在浏览器中操作
# - 打开登录页
# - 输入用户名: testuser
# - 输入密码: password123
# - 点击登录按钮
# - 等待跳转到首页

# 5. 关闭浏览器
# Agent 自动分析并生成脚本

# 6. 查看结果
# automation/
# ├── TC001-1234567890.spec.ts    # 测试脚本
# ├── TC001-1234567890_README.md  # 说明文档
# └── TC001-1234567890/           # 完整数据
```

生成的脚本示例：
```typescript
import { test, expect } from '@playwright/test';

const testData = {
  username: 'testuser',
  password: 'password123',
};

test('test_user_login', async ({ page }) => {
  // 用户登录流程
  await page.goto('https://example.com/login');
  await page.fill('[data-testid="username"]', testData.username);
  await page.fill('[data-testid="password"]', testData.password);
  await page.click('role=button[name="登录"]');
  
  // 验证登录成功
  await expect(page).toHaveURL('https://example.com/dashboard');
});
```

## 🛠️ 工具集

### 配置工具

```bash
# LLM 配置向导
node cli/commands/llm-config.js

# 查看当前配置
node cli/commands/llm-config.js show

# 诊断配置
node diagnose-llm.js

# 快速修复
./fix-pi-model.sh
```

### 测试工具

```bash
# 测试 explore 功能（模拟数据）
node test-explore.js mock

# 测试语义分析
node test-explore.js semantic

# 测试脚本生成
node test-explore.js generate

# 运行所有测试
npm test
```

### Agent 命令

| 命令 | 快捷键 | 功能 |
|------|--------|------|
| `/project` | Ctrl+Alt+P | 选择项目 |
| `/status` | Ctrl+Shift+0 | 查看进度 |
| `/analyze` | Ctrl+Shift+1 | 需求分析 |
| `/points` | Ctrl+Shift+2 | 生成测试点 |
| `/cases` | Ctrl+Shift+3 | 生成用例 |
| `/explore` | Ctrl+Shift+4 | 智能探索 ⭐ |
| `/record` | Ctrl+Shift+5 | 传统录制 |
| `/run` | Ctrl+Shift+6 | 运行测试 |
| `/heal` | Ctrl+Shift+7 | 修复选择器 |
| `/defects` | Ctrl+Shift+8 | 管理缺陷 |
| `/report` | Ctrl+Shift+9 | 生成报告 |

## 📚 文档

- [LLM 配置指南](./LLM_CONFIGURATION.md) - 详细的 LLM 配置说明
- [Explore 功能](./EXPLORE_AND_GENERATE.md) - 智能探索功能详解
- [产品规划](./1008plan.md) - OpenTest 产品规划

## 💡 最佳实践

1. **优先配置 LLM**
   - DeepSeek（推荐，性价比高）
   - Ollama（本地免费）
   - OpenRouter 免费模型（临时使用）

2. **完整操作一遍**
   - 按照真实用户场景
   - 不要太快
   - 确保页面完全加载

3. **检查生成的脚本**
   - 验证测试意图
   - 检查测试数据
   - 阅读 README

4. **善用命令补全**
   - 输入 `/ex` 按 Tab 补全
   - 使用快捷键提高效率

## 🎉 开始使用

```bash
# 1. 修复配置（如果有问题）
./fix-pi-model.sh

# 2. 启动 Agent
npx pi

# 3. 开始探索！
/explore
```

祝测试愉快！🚀
