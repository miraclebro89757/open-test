#!/bin/bash
# OpenTest Custom Web UI 初始化脚本

set -e

echo "🚀 初始化 OpenTest Custom Web UI 项目..."
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 需要安装 Node.js 22.19.0+"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"
echo ""

# 创建项目目录
PROJECT_ROOT="/Users/zephyrus/Documents/个人开发/open-test"
WEB_UI_DIR="$PROJECT_ROOT/web-ui"

cd "$PROJECT_ROOT"

echo "📁 创建项目结构..."
mkdir -p web-ui/{frontend,backend/src/{routes,services,utils},docs}

# 创建前端项目
echo ""
echo "🎨 初始化前端项目 (React + TypeScript + Vite)..."
cd web-ui
npm create vite@latest frontend -- --template react-ts

# 创建后端项目
echo ""
echo "🔧 初始化后端项目..."
cd backend

cat > package.json << 'EOF'
{
  "name": "opentest-web-backend",
  "version": "1.0.0",
  "description": "OpenTest Custom Web UI Backend",
  "main": "src/server.js",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  },
  "keywords": ["opentest", "test", "automation"],
  "author": "OpenTest Team",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "ws": "^8.14.2",
    "fs-extra": "^11.1.1",
    "body-parser": "^1.20.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF

echo "📦 安装后端依赖..."
npm install

# 创建基础服务器
cat > src/server.js << 'EOF'
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 30142;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件（前端构建产物）
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// API 路由
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.get('/api/projects', (req, res) => {
  // TODO: 读取项目列表
  res.json({ projects: [] });
});

app.post('/api/projects', (req, res) => {
  // TODO: 创建项目
  res.json({ success: true });
});

// 创建 HTTP 服务器
const server = createServer(app);

// WebSocket 服务器
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    // TODO: 处理消息
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log('');
  console.log('✅ OpenTest Web UI Backend 启动成功!');
  console.log('');
  console.log(`🌐 API Server:  http://localhost:${PORT}`);
  console.log(`🔌 WebSocket:   ws://localhost:${PORT}`);
  console.log('');
});
EOF

# 创建 OpenTest 适配器
cat > src/services/opentestAdapter.js << 'EOF'
import { spawn } from 'child_process';

export class OpenTestAdapter {
  /**
   * 执行 OpenTest CLI 命令
   */
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
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(stderr || `Exit code: ${code}`));
        }
      });
    });
  }
  
  /**
   * 分析需求文档
   */
  async analyzeRequirement(filePath) {
    const result = await this.executeCommand('run', [
      '--print',
      `@${filePath}`,
      '/analyze'
    ]);
    return this.parseOutput(result.stdout);
  }
  
  /**
   * 解析输出
   */
  parseOutput(output) {
    // TODO: 解析 OpenTest 输出
    return { success: true, data: output };
  }
}
EOF

# 创建 README
cd "$WEB_UI_DIR"
cat > README.md << 'EOF'
# OpenTest Custom Web UI

专为测试人员设计的 OpenTest Web 界面。

## 🚀 快速开始

### 开发模式

```bash
# 启动后端
cd backend
npm run dev

# 启动前端（新终端）
cd frontend
npm run dev
```

访问：http://localhost:5173

### 生产构建

```bash
# 构建前端
cd frontend
npm run build

# 启动后端（会自动服务前端）
cd backend
npm start
```

访问：http://localhost:30142

## 📁 项目结构

```
web-ui/
├── frontend/       # React + TypeScript 前端
├── backend/        # Node.js + Express 后端
└── docs/           # 文档
```

## 🔧 功能列表

- [ ] 项目管理
- [ ] 需求上传和分析
- [ ] 测试点管理
- [ ] 测试用例管理
- [ ] 可视化录制
- [ ] 执行控制台
- [ ] 测试报告

## 📚 技术栈

- **前端**: React 18 + TypeScript + Vite + Ant Design
- **后端**: Node.js + Express + WebSocket
- **通信**: RESTful API + WebSocket
- **部署**: 单服务器部署

## 🎯 设计目标

为测试人员提供：
1. 直观的工作流程
2. 可视化的测试管理
3. 实时的执行反馈
4. 专业的报告展示

## 📖 文档

查看 [设计文档](../docs/CUSTOM_WEB_UI_DESIGN.md) 了解详细架构。
EOF

echo ""
echo "✅ 项目初始化完成！"
echo ""
echo "📂 项目位置: $WEB_UI_DIR"
echo ""
echo "🎯 下一步："
echo "1. cd $WEB_UI_DIR/frontend && npm install"
echo "2. cd $WEB_UI_DIR/backend && npm start"
echo "3. cd $WEB_UI_DIR/frontend && npm run dev"
echo ""
echo "🌐 访问: http://localhost:5173"
echo ""
