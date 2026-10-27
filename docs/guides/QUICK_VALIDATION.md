# OpenTest 快速验证指南

## ✅ 系统状态确认

```bash
opentest-ai doctor
```

**预期输出**：

Node.js 不低于 `22.19.0`，并且有一行本机 Chrome 的路径。没有 Chrome 时，这一行是已下载的 Playwright Chromium。Docker 不在这次检查里。还没有浏览器时，它会提示运行 `opentest-ai install`。

---

## 🎯 核心功能测试

### 1. AI 对话式测试生成

```bash
opentest-ai run "访问 https://example.com 并验证标题包含 Example"
```

**预期行为**：
- Agent 自动分析需求
- 生成 Playwright 测试脚本
- 保存到 `tests/generated/` 目录
- 执行测试并显示结果

---

### 2. 录制

在 Agent 里使用 `/record`，并给出沙箱的 `http` 或 `https` 地址。浏览器不会让人选 Chromium、Firefox 或 WebKit。本机有 Google Chrome 就打开它，没有才用下载的 Playwright Chromium。

登录一次后，在控制页连续录多条。脚本写到产品目录的 `automation/<编号>-<标题>.spec.ts`。

---

### 3. 测试报告查看

```bash
opentest-ai report
```

**预期输出**：
```
📊 测试执行报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总计: 15 个测试
✓ 通过: 12
✗ 失败: 2
⊘ 跳过: 1

📁 最近的报告:
  • tests/reports/latest/index.html
```

---

## 🔍 常见问题排查

### 问题 1：LLM API 调用失败

```bash
# 测试 API 连接
curl -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $(jq -r '.profiles["free-openrouter"].apiKey' ~/.opentest/config.json)" \
  -H "Content-Type: application/json" \
  -d '{"model":"stealth/space-bunny-alpha","messages":[{"role":"user","content":"test"}]}'
```

**预期**：返回 JSON 响应，不是 404

---

### 问题 2：浏览器启动失败

```bash
opentest-ai doctor
opentest-ai install
opentest-ai browser verify
```

有 Google Chrome 时不会下载。没有时才会安装 Playwright 1.63.0 的 Chromium。

---

### 问题 3：Docker 服务未启动

```bash
# 启动 Docker 服务
open -a Docker  # macOS
# 或手动打开 Docker Desktop

# 等待启动后验证
docker ps
```

---

## 📝 验证清单

完成以下测试，确认 OpenTest 完全可用：

- [ ] `opentest-ai doctor` 全部通过
- [ ] `opentest-ai run` 能生成并执行测试
- [ ] `opentest-ai record` 能录制操作
- [ ] `opentest-ai report` 能查看报告

---

## 🚀 下一步

### 立即可用（今天）
✅ 使用终端 Agent 进行所有测试操作

### 本周计划（1-2天）
🔨 搭建简易 Web 仪表板：
```bash
./scripts/create-web-ui.sh
cd web-ui
npm install
npm start
```

### 长期规划（1-2个月）
🎯 根据使用反馈，扩展完整的测试管理平台

---

## 💡 使用技巧

### 批量生成测试

创建 `test-plan.txt`：
```
访问首页并验证标题
测试用户登录流程
测试商品搜索功能
测试购物车添加商品
```

然后：
```bash
cat test-plan.txt | while read line; do
  opentest-ai run "$line"
done
```

### 定时执行

使用 cron 定时运行测试：
```bash
# 每天早上 9 点执行
0 9 * * * cd ~/my-project && opentest-ai run "冒烟测试" >> ~/test-log.txt 2>&1
```

### 与 CI/CD 集成

```yaml
# .github/workflows/test.yml
name: E2E Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install OpenTest
        run: npm install -g opentest-ai
      - name: Run Tests
        run: opentest-ai run "完整回归测试"
        env:
          OPENTEST_API_KEY: ${{ secrets.OPENTEST_API_KEY }}
```

---

## 📚 相关文档

- [完整 README](README.md)
- [中文文档](README.zh.md)
- [故障排查](TROUBLESHOOTING.md)
- [本地测试指南](LOCAL_TEST_GUIDE.md)
- [Web UI 设计](docs/CUSTOM_WEB_UI_DESIGN.md)
- [Web UI 策略对比](docs/WEB_UI_STRATEGY.md)
