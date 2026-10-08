# LLM 配置指南

## 设计理念

**配置一次，全部生效**

OpenTest 采用统一的默认 LLM 配置策略。用户只需配置一次 LLM，之后所有功能都会自动使用这个配置，无需在每个工具中重复指定。

## 快速开始

### 方式 1：交互式配置向导（推荐）

```bash
node cli/commands/llm-config.js
```

向导会引导你：
1. 选择 LLM 供应商（DeepSeek / OpenAI / Claude / OpenRouter / Ollama / 自定义）
2. 配置 API Key 或环境变量
3. 选择配置范围（项目级 / 全局级）

配置完成后，所有功能自动生效！

### 方式 2：手动配置文件

#### 项目级配置（推荐）

创建 `opentest.config.json`：

```json
{
  "llm": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "apiKey": "${DEEPSEEK_API_KEY}",
    "baseUrl": "https://api.deepseek.com/v1"
  }
}
```

#### 全局配置

创建 `~/.opentest/models.json`：

```json
{
  "active_profile": "default",
  "profiles": {
    "default": {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "apiKey": "${DEEPSEEK_API_KEY}",
      "baseUrl": "https://api.deepseek.com/v1"
    }
  }
}
```

### 方式 3：环境变量

```bash
export DEEPSEEK_API_KEY="your-api-key"
export OPENTEST_LLM_PROVIDER="deepseek"
export OPENTEST_LLM_MODEL="deepseek-chat"
```

## 支持的 LLM 供应商

### DeepSeek（推荐）

性价比最高，中文支持好。

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "apiKey": "${DEEPSEEK_API_KEY}",
  "baseUrl": "https://api.deepseek.com/v1"
}
```

获取 API Key: https://platform.deepseek.com/

### OpenAI

最强大的模型，但价格较高。

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "apiKey": "${OPENAI_API_KEY}",
  "baseUrl": "https://api.openai.com/v1"
}
```

模型选项：
- `gpt-4o` - 最强（贵）
- `gpt-4o-mini` - 经济实惠
- `gpt-4-turbo` - 上一代旗舰

获取 API Key: https://platform.openai.com/

### Anthropic Claude

代码理解能力强，推理能力出色。

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "baseUrl": "https://api.anthropic.com/v1"
}
```

模型选项：
- `claude-3-5-sonnet-20241022` - 最新最强
- `claude-3-opus-20240229` - 最强推理
- `claude-3-haiku-20240307` - 最快最便宜

获取 API Key: https://console.anthropic.com/

### OpenRouter

统一多个供应商，一个 API Key 访问所有模型。

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-3.5-sonnet",
  "apiKey": "${OPENROUTER_API_KEY}",
  "baseUrl": "https://openrouter.ai/api/v1"
}
```

可用模型：
- `anthropic/claude-3.5-sonnet`
- `openai/gpt-4o`
- `google/gemini-pro-1.5`
- `meta-llama/llama-3.1-70b-instruct`
- 等等...

获取 API Key: https://openrouter.ai/

### Ollama（本地免费）

在本地运行开源模型，完全免费。

```json
{
  "provider": "ollama",
  "model": "qwen2.5:14b",
  "apiKey": "ollama-no-key-required",
  "baseUrl": "http://localhost:11434/v1"
}
```

**先决条件**：安装 Ollama (https://ollama.ai/)

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 拉取模型
ollama pull qwen2.5:14b

# 启动 Ollama
ollama serve
```

推荐模型：
- `qwen2.5:14b` - 通义千问，中文最强
- `llama3.2:latest` - Meta Llama 3.2
- `deepseek-coder-v2:latest` - DeepSeek 代码模型

### 自定义（兼容 OpenAI API）

任何兼容 OpenAI API 的服务。

```json
{
  "provider": "custom",
  "model": "your-model-name",
  "apiKey": "your-api-key",
  "baseUrl": "https://your-api-endpoint.com/v1"
}
```

## 配置优先级

OpenTest 按以下优先级读取配置：

1. **命令行参数**（最高优先级，暂未实现）
   ```bash
   /explore --provider openai --model gpt-4o
   ```

2. **项目配置** `./opentest.config.json`
   - 适合团队共享配置
   - 建议使用环境变量引用 API Key

3. **用户配置** `~/.opentest/models.json`
   - 个人全局配置
   - 跨所有项目生效

4. **环境变量**
   ```bash
   DEEPSEEK_API_KEY=xxx
   OPENAI_API_KEY=xxx
   OPENTEST_LLM_PROVIDER=deepseek
   OPENTEST_LLM_MODEL=deepseek-chat
   ```

## 自动生效的功能

配置默认 LLM 后，以下所有功能自动使用 AI 增强：

### ✅ Browser Explore（浏览器探索）

```bash
/explore https://example.com
```

AI 增强：
- 识别用户测试意图
- 提取业务场景描述
- 生成符合业务语言的测试步骤
- 建议有意义的测试用例名称

**效果对比**：

| 项目 | 规则引擎 | AI 增强 |
|------|---------|---------|
| 测试名称 | `test_scenario` | `test_user_login` |
| 步骤描述 | `点击按钮：登录` | `使用正确凭证登录系统` |
| 意图识别 | `自动化测试场景` | `测试正常登录流程，验证凭证正确性` |

### ✅ Requirement Analysis（需求分析）

```bash
/analyze @requirements.md
```

AI 增强：
- 提取业务规则
- 识别状态机
- 发现前置条件
- 识别风险点

### ✅ Test Points Generation（测试点生成）

```bash
/points
```

AI 增强：
- 基于需求生成测试点
- 识别边界条件
- 优先级判断

### ✅ Test Cases Generation（测试用例生成）

```bash
/cases
```

AI 增强：
- 生成详细测试步骤
- 预期结果描述
- 测试数据建议

### ✅ HAR Analysis（API 分析）

```bash
/record --mode api-only
```

AI 增强：
- 识别请求依赖关系
- 提取动态参数
- 识别敏感数据

### ✅ Selector Healing（选择器修复）

```bash
/heal
```

AI 增强：
- 智能建议替代选择器
- 理解元素语义

## 查看当前配置

### 诊断工具

```bash
node diagnose-llm.js
```

输出示例：
```
═══════════════════════════════════════════════════════════
  OpenTest LLM Configuration Diagnostics
═══════════════════════════════════════════════════════════

📁 检查 项目 LLM 配置
   路径: ./opentest.config.json
   ✓ 文件存在
   ✓ JSON 格式正确

   配置内容:
   - provider: deepseek
   - model: deepseek-chat
   - apiKey: ✓ 已设置

🧪 测试 LLM Client 创建
   ✓ LLM Client 创建成功
   - Active Profile: default

✨ OpenTest 功能状态:
   - 基础功能: ✓ 正常
   - AI 增强:  ✓ 已配置

✓ 所有 OpenTest 功能将自动使用 AI 增强分析
```

### 查看配置详情

```bash
node cli/commands/llm-config.js show
```

输出示例：
```
═══════════════════════════════════════════════════════════
  当前 LLM 配置
═══════════════════════════════════════════════════════════

活动 Profile: default
来源: project

配置详情:
  供应商: deepseek
  模型: deepseek-chat
  Base URL: https://api.deepseek.com/v1
  API Key: sk-xxx...xxxx
```

## 安全性建议

### ✅ 推荐做法

1. **使用环境变量引用 API Key**
   ```json
   {
     "apiKey": "${DEEPSEEK_API_KEY}"
   }
   ```

2. **项目配置使用 .gitignore**
   ```bash
   echo "opentest.config.json" >> .gitignore
   ```

3. **团队共享配置示例**
   ```bash
   # 提交配置模板
   opentest.config.example.json
   
   # .gitignore 实际配置
   opentest.config.json
   ```

### ❌ 不推荐做法

1. **直接在项目配置中硬编码 API Key**
   ```json
   {
     "apiKey": "sk-actual-key-here"  // ❌ 危险！
   }
   ```

2. **提交包含真实 API Key 的配置到 Git**

## 故障排查

### 问题：配置后仍报错 "No endpoints found"

**原因**：配置的模型名称不正确或模型不可用。

**解决**：
```bash
# 1. 诊断配置
node diagnose-llm.js

# 2. 查看详细配置
node cli/commands/llm-config.js show

# 3. 重新配置
node cli/commands/llm-config.js
```

### 问题：功能降级到规则引擎

**原因**：LLM 调用失败，系统自动降级。

**现象**：
```
⚠️  AI 分析失败: LLM call failed: 404
ℹ️  降级到规则引擎...
```

**解决**：
1. 检查 API Key 是否正确
2. 检查模型名称是否正确
3. 检查网络连接
4. 查看 API 余额

### 问题：想在不同场景使用不同模型

**方案 1**：Task-level Model Routing（已支持）
```bash
# 配置不同任务使用不同模型
/task-model analyze strong
/task-model points medium
/task-model cases cheap
```

**方案 2**：临时覆盖（待实现）
```bash
# 临时使用特定模型
/explore --model gpt-4o
```

## 最佳实践

### 开发阶段

使用便宜的模型进行开发和测试：
- DeepSeek（最推荐）
- GPT-4o-mini
- Ollama（免费）

### 生产阶段

关键任务使用强大模型：
- GPT-4o
- Claude 3.5 Sonnet

### 团队协作

1. 提供配置示例文件
2. 使用环境变量
3. 文档中说明如何获取 API Key

### 成本控制

1. 使用 Task-level Routing 区分任务
2. 简单任务用 cheap 模型
3. 复杂任务用 strong 模型
4. 定期检查 API 使用量

## 相关文档

- [配置向导使用](../cli/commands/llm-config.js)
- [诊断工具](../diagnose-llm.js)
- [Explore 功能](./EXPLORE_AND_GENERATE.md)
- [Task Routing](../cli/llm/config-store.js)

## 总结

OpenTest 的 LLM 配置遵循 **"配置一次，全部生效"** 的理念。

只需一次配置：
```bash
node cli/commands/llm-config.js
```

之后所有功能自动享受 AI 增强，无需重复配置！ 🎉
