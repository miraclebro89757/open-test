# OpenTest 定制 Web UI 设计方案

## 🎯 设计目标

为测试人员打造专业的 Web UI，核心特性：

1. **测试流程可视化** - 需求 → 测试点 → 用例 → 自动化
2. **用例管理** - 增删改查、批量操作、标签分类
3. **录制回放** - 可视化录制、步骤编辑、一键回放
4. **报告生成** - 实时统计、图表展示、导出分享
5. **团队协作** - 多人同时使用、权限管理、评论讨论

---

## 🏗️ 技术架构

### 前端技术栈

```
React 18 + TypeScript + Vite
├── UI 框架: Ant Design / shadcn/ui
├── 状态管理: Zustand / Redux Toolkit
├── 路由: React Router v6
├── 图表: ECharts / Recharts
├── 编辑器: Monaco Editor
├── WebSocket: Socket.io-client
└── 构建: Vite + SWC
```

### 后端技术栈

```
Node.js + Express / Fastify
├── API: RESTful + WebSocket
├── 文件系统: fs-extra
├── 进程管理: child_process
├── 测试执行: Playwright
└── 数据存储: 文件系统 + Neo4j (可选)
```

---

## 📁 项目结构

```
opentest-web-ui/
├── frontend/                    # 前端项目
│   ├── src/
│   │   ├── pages/              # 页面
│   │   │   ├── Dashboard/      # 仪表板
│   │   │   ├── Requirements/   # 需求管理
│   │   │   ├── TestPoints/     # 测试点
│   │   │   ├── TestCases/      # 测试用例
│   │   │   ├── Automation/     # 自动化管理
│   │   │   ├── Recording/      # 录制界面
│   │   │   ├── Execution/      # 执行结果
│   │   │   └── Reports/        # 测试报告
│   │   ├── components/         # 通用组件
│   │   │   ├── RequirementUploader/
│   │   │   ├── TestPointEditor/
│   │   │   ├── CaseTemplateSelector/
│   │   │   ├── RecordingPlayer/
│   │   │   ├── StepEditor/
│   │   │   └── ReportViewer/
│   │   ├── stores/             # 状态管理
│   │   ├── hooks/              # 自定义 Hooks
│   │   ├── services/           # API 服务
│   │   └── utils/              # 工具函数
│   ├── public/
│   └── package.json
│
├── backend/                     # 后端 API
│   ├── src/
│   │   ├── routes/             # API 路由
│   │   │   ├── requirements.js # 需求 API
│   │   │   ├── testPoints.js   # 测试点 API
│   │   │   ├── testCases.js    # 用例 API
│   │   │   ├── recording.js    # 录制 API
│   │   │   ├── execution.js    # 执行 API
│   │   │   └── reports.js      # 报告 API
│   │   ├── services/           # 业务逻辑
│   │   │   ├── opentestAdapter.js  # OpenTest 适配器
│   │   │   ├── fileManager.js      # 文件管理
│   │   │   ├── processRunner.js    # 进程执行
│   │   │   └── wsHandler.js        # WebSocket
│   │   ├── utils/
│   │   └── server.js           # 服务器入口
│   └── package.json
│
└── cli/                         # CLI 集成
    └── commands/
        └── web-ui.js           # 启动命令
```

---

## 🎨 核心页面设计

### 1. 仪表板 (Dashboard)

```tsx
// 卡片式布局
┌─────────────────────────────────────────────────┐
│  📊 项目概览                    [+ 新建项目]      │
├─────────────────────────────────────────────────┤
│  项目A                                          │
│  需求: 5个 | 测试点: 120个 | 用例: 85个          │
│  自动化: 45个 | 通过率: 92%                      │
│  [打开] [报告] [设置]                           │
├─────────────────────────────────────────────────┤
│  最近活动                                       │
│  • 10分钟前: 完成用例 TC-012 的录制              │
│  • 1小时前: 生成了 15 个新测试点                │
│  • 昨天: 执行了完整回归测试                     │
└─────────────────────────────────────────────────┘
```

### 2. 需求管理 (Requirements)

```tsx
┌─────────────────────────────────────────────────┐
│  📄 需求文档                 [上传] [分析]        │
├─────────────────────────────────────────────────┤
│  [文档列表]       │  [文档预览/编辑]             │
│  • 需求1.md      │  ┌─────────────────────┐    │
│  • 需求2.docx    │  │ # 用户登录功能      │    │
│  • 需求3.pdf     │  │ ## 功能描述         │    │
│                  │  │ 用户可以通过...     │    │
│  [知识图谱]      │  └─────────────────────┘    │
│  • 特性: 12      │                              │
│  • 规则: 35      │  [📊 分析结果]               │
│  • 场景: 28      │  提取了 3 个特性              │
│                  │  识别了 8 个规则              │
│                  │  生成了 15 个场景             │
└─────────────────────────────────────────────────┘
```

### 3. 测试点管理 (Test Points)

```tsx
┌─────────────────────────────────────────────────┐
│  🎯 测试点列表    [生成] [批量确认] [导出]       │
├─────────────────────────────────────────────────┤
│  [筛选] 特性: 全部 ▼  状态: 待确认 ▼           │
│  [搜索] 输入关键词...                           │
├─────────────────────────────────────────────────┤
│  ☐ TP-001 用户登录-正常场景        [确认] [编辑]│
│     描述: 使用正确的用户名和密码登录             │
│     优先级: P0  特性: 用户认证                  │
│                                                 │
│  ☐ TP-002 用户登录-密码错误        [确认] [编辑]│
│     描述: 输入错误密码应显示错误提示             │
│     优先级: P1  特性: 用户认证                  │
│                                                 │
│  ☑ TP-003 用户登录-记住密码        [确认] [编辑]│
│     描述: 勾选记住密码后下次自动填充             │
│     优先级: P2  特性: 用户认证                  │
│     ✅ 已确认 → 已生成用例 TC-001               │
└─────────────────────────────────────────────────┘
```

### 4. 测试用例管理 (Test Cases)

```tsx
┌─────────────────────────────────────────────────┐
│  📝 测试用例      [新建] [批量导入] [导出]       │
├─────────────────────────────────────────────────┤
│  [用例列表]          │  [用例详情]              │
│  ┌──────────────┐  │  ┌────────────────────┐  │
│  │ TC-001 ✅    │  │  │ ID: TC-001         │  │
│  │ 用户登录正常  │  │  │ 标题: 用户登录正常  │  │
│  │ P0 | 已自动化│  │  │ 优先级: P0         │  │
│  ├──────────────┤  │  │ 状态: 已自动化     │  │
│  │ TC-002 ⚠️    │  │  │                    │  │
│  │ 密码错误提示  │  │  │ 前置条件:          │  │
│  │ P1 | 待录制  │  │  │ • 用户已注册       │  │
│  ├──────────────┤  │  │                    │  │
│  │ TC-003 ⏸    │  │  │ 测试步骤:          │  │
│  │ 记住密码功能  │  │  │ 1. 打开登录页面    │  │
│  │ P2 | 未开始  │  │  │ 2. 输入用户名      │  │
│  └──────────────┘  │  │ 3. 输入密码        │  │
│                    │  │ 4. 点击登录按钮     │  │
│  [统计信息]        │  │                    │  │
│  总计: 85         │  │ 预期结果:          │  │
│  已自动化: 45     │  │ • 成功登录         │  │
│  待录制: 25       │  │ • 跳转到首页       │  │
│  未开始: 15       │  │                    │  │
│                    │  │ [▶ 录制] [▶ 执行] │  │
│                    │  └────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 5. 录制界面 (Recording)

```tsx
┌─────────────────────────────────────────────────┐
│  🎬 测试录制      用例: TC-001                   │
├─────────────────────────────────────────────────┤
│  [控制面板]                                     │
│  ● 录制中  [⏸ 暂停] [⏹ 停止] [💾 保存]        │
│  时长: 00:02:35                                │
├─────────────────────────────────────────────────┤
│  [录制步骤]                │  [浏览器窗口]       │
│  1. ✅ 打开登录页面        │  ┌──────────────┐ │
│     URL: /login           │  │  [浏览器预览] │ │
│  2. ✅ 输入用户名          │  │              │ │
│     #username: admin      │  │   📱 实时录制 │ │
│  3. ✅ 输入密码            │  │              │ │
│     #password: ****       │  │              │ │
│  4. ⏺ 点击登录按钮         │  │              │ │
│     button[type=submit]   │  │              │ │
│                           │  └──────────────┘ │
│  [选择器建议]              │                   │
│  • data-testid="login"    │  [网络请求]       │
│  • #login-btn             │  POST /api/login  │
│  • .btn-primary           │  Status: 200      │
│                           │  Time: 245ms      │
└─────────────────────────────────────────────────┘
```

### 6. 执行结果 (Execution)

```tsx
┌─────────────────────────────────────────────────┐
│  ▶️ 测试执行      [全部执行] [执行选中]          │
├─────────────────────────────────────────────────┤
│  执行计划: 回归测试 2024-10-09 11:30            │
│  进度: ████████████░░░░░░░░ 60% (51/85)        │
├─────────────────────────────────────────────────┤
│  [用例列表]          │  [执行详情]              │
│  ✅ TC-001 通过     │  ┌────────────────────┐  │
│     用户登录正常     │  │ 用例: TC-001       │  │
│     2.3s            │  │ 状态: ✅ 通过      │  │
│                     │  │ 时长: 2.3s         │  │
│  ✅ TC-002 通过     │  │                    │  │
│     密码错误提示     │  │ 步骤执行:          │  │
│     1.8s            │  │ ✅ 打开登录页面    │  │
│                     │  │ ✅ 输入用户名      │  │
│  ❌ TC-003 失败     │  │ ✅ 输入密码        │  │
│     记住密码功能     │  │ ✅ 点击登录按钮    │  │
│     3.1s            │  │ ✅ 验证登录成功    │  │
│     [查看详情]      │  │                    │  │
│                     │  │ 截图:              │  │
│  ⏸ TC-004 等待中    │  │ [before] [after]   │  │
│     退出登录        │  │                    │  │
│                     │  │ 日志:              │  │
│  [统计]             │  │ [INFO] 开始执行... │  │
│  通过: 48 (94%)    │  │ [INFO] 登录成功    │  │
│  失败: 3 (6%)      │  │                    │  │
│  待执行: 34        │  └────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 7. 测试报告 (Reports)

```tsx
┌─────────────────────────────────────────────────┐
│  📊 测试报告      [生成新报告] [导出PDF]         │
├─────────────────────────────────────────────────┤
│  回归测试报告 - 2024-10-09                      │
├─────────────────────────────────────────────────┤
│  [概览]                                         │
│  ┌─────────────────────────────────────────┐   │
│  │  执行用例: 85  通过: 80  失败: 5         │   │
│  │  通过率: 94%   自动化率: 53%             │   │
│  │  总时长: 12分35秒                        │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [图表展示]                                     │
│  ┌───────────────┐  ┌───────────────────┐     │
│  │  通过率趋势   │  │  用例分布         │     │
│  │   📈          │  │     🥧            │     │
│  │              │  │  P0: 40%         │     │
│  │   94%→95%    │  │  P1: 35%         │     │
│  │              │  │  P2: 25%         │     │
│  └───────────────┘  └───────────────────┘     │
│                                                 │
│  [失败用例明细]                                 │
│  ❌ TC-003 记住密码功能                         │
│     原因: 选择器失效 #remember-checkbox         │
│     [自愈建议] [手动修复]                       │
│                                                 │
│  ❌ TC-015 上传头像                             │
│     原因: 超时（30s）                           │
│     [重新执行] [调整超时]                       │
└─────────────────────────────────────────────────┘
```

---

## 🔌 OpenTest 集成

### CLI 集成

```javascript
// cli/commands/web-ui.js
async function launchCustomWebUI(options = {}) {
  const port = options.port || 30142; // 区别于 pi-web
  
  // 1. 启动后端服务
  const backend = spawn('node', ['backend/src/server.js'], {
    env: {
      ...process.env,
      PORT: port,
      OPENTEST_HOME: process.env.OPENTEST_HOME || '~/.opentest',
    }
  });
  
  // 2. 打开浏览器
  if (!options.noOpen) {
    open(`http://localhost:${port}`);
  }
  
  console.log(`✅ OpenTest Web UI 启动成功`);
  console.log(`🌐 地址: http://localhost:${port}`);
}
```

### 后端适配器

```javascript
// backend/src/services/opentestAdapter.js
const { spawn } = require('child_process');

class OpenTestAdapter {
  // 执行 OpenTest CLI 命令
  async executeCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      const proc = spawn('opentest-ai', [command, ...args]);
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(stderr || `Exit code: ${code}`));
        }
      });
    });
  }
  
  // 分析需求
  async analyzeRequirement(filePath) {
    // 调用 opentest-ai run，传入分析命令
    const result = await this.executeCommand('run', [
      '--print',
      `@${filePath}`,
      '/analyze'
    ]);
    return this.parseAnalysisResult(result.stdout);
  }
  
  // 生成测试点
  async generateTestPoints(projectPath) {
    // 类似实现
  }
  
  // 录制测试
  async recordTest(caseId, sandboxUrl) {
    // 类似实现
  }
}
```

---

## 🚀 快速开始

### 1. 创建项目

```bash
# 在 open-test 项目下创建 web-ui 目录
cd /Users/zephyrus/Documents/个人开发/open-test
mkdir -p web-ui
cd web-ui

# 创建前端
npm create vite@latest frontend -- --template react-ts

# 创建后端
mkdir backend
cd backend
npm init -y
npm install express cors ws fs-extra
```

### 2. 基础实现（MVP）

**最小可行版本功能**：
1. ✅ 项目列表和创建
2. ✅ 需求文档上传
3. ✅ 触发 OpenTest 分析
4. ✅ 显示测试点列表
5. ✅ 显示测试用例
6. ✅ 基础报告展示

**时间估算**: 1周

---

## 📦 分阶段实现

### Phase 1: 核心功能（1-2周）
- [ ] 项目管理（CRUD）
- [ ] 需求上传和预览
- [ ] 调用 OpenTest CLI
- [ ] 测试点列表展示
- [ ] 测试用例列表展示

### Phase 2: 增强功能（1-2周）
- [ ] 可视化录制界面
- [ ] 步骤编辑器
- [ ] 执行控制台
- [ ] 实时日志展示

### Phase 3: 高级功能（2-3周）
- [ ] 图表统计
- [ ] PDF 报告生成
- [ ] 团队协作
- [ ] 权限管理

---

## 💡 关键技术点

### 1. 与 OpenTest CLI 交互

```typescript
// services/opentestService.ts
export async function analyzeRequirement(filePath: string) {
  const response = await fetch('/api/opentest/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });
  return response.json();
}
```

### 2. 实时进度展示（WebSocket）

```typescript
// WebSocket 连接
const ws = new WebSocket('ws://localhost:30142/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'progress') {
    // 更新进度条
    setProgress(data.progress);
  } else if (data.type === 'log') {
    // 添加日志
    addLog(data.message);
  }
};
```

### 3. 文件系统集成

```typescript
// 读取 OpenTest 产物
export async function loadTestCases(projectPath: string) {
  const response = await fetch(`/api/projects/${projectPath}/cases`);
  return response.json();
}
```

---

## 🎨 UI/UX 设计要点

1. **工作流导向** - 左侧流程，右侧详情
2. **快捷操作** - 键盘快捷键支持
3. **实时反馈** - 进度条、WebSocket 更新
4. **响应式设计** - 支持桌面和平板
5. **暗色模式** - 减少眼睛疲劳

---

## 📚 参考资源

- **UI 参考**: TestRail、Jira、GitHub Actions
- **技术栈**: React + TypeScript + Ant Design
- **架构参考**: VS Code Remote Development

---

## ✅ 下一步行动

1. **创建基础项目结构**
2. **实现 API 适配层**
3. **开发核心页面**
4. **集成到 OpenTest CLI**

需要我帮你开始搭建项目骨架吗？
