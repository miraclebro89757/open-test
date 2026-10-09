'use strict';

const { spawn } = require('child_process');
const { resolveLLMConfig } = require('../llm/config-store');
const { prepareGraphService } = require('../services/local');

/**
 * Launch pi-web Web UI for OpenTest.
 * 
 * Pi-web provides a browser-based interface for:
 * - Session management (browse, resume, create, delete)
 * - File browsing and editing
 * - Model configuration
 * - Real-time agent interaction
 * 
 * @param {Object} options - Launch options
 * @param {number} [options.port=30141] - Server port
 * @param {string} [options.hostname='127.0.0.1'] - Bind hostname
 * @param {boolean} [options.noOpen=false] - Don't open browser automatically
 */
async function launchWeb(options = {}) {
  const port = options.port || process.env.PORT || 30141;
  const hostname = options.hostname || process.env.PI_WEB_HOSTNAME || '127.0.0.1';
  const noOpen = options.noOpen || process.env.PI_WEB_NO_OPEN === '1';

  console.log('\n🌐 正在启动 OpenTest Web UI...\n');

  // Check if pi-web is installed
  try {
    require.resolve('@agegr/pi-web');
  } catch {
    console.log('📦 首次运行需要安装 pi-web...');
    console.log('   这会下载 @agegr/pi-web 包（约需要 1-2 分钟）\n');
    
    // Install pi-web as a peer dependency
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const install = spawn(npm, ['install', '--no-save', '@agegr/pi-web@latest'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    await new Promise((resolve, reject) => {
      install.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`npm install failed with code ${code}`));
      });
      install.on('error', reject);
    });

    console.log('✅ pi-web 安装完成\n');
  }

  // Verify LLM configuration
  let hasConfig = false;
  try {
    const resolved = resolveLLMConfig({
      env: process.env,
      homeDir: process.env.OPENTEST_HOME,
    });
    hasConfig = resolved.profiles.some((p) => p.usable);
  } catch {
    // Config not required for launch, just warn
  }

  if (!hasConfig) {
    console.log('⚠️  未检测到 LLM 配置，Web UI 启动后请先配置模型：');
    console.log('   打开 Web UI → Models 面板 → 添加 API Key\n');
  }

  // Prepare Neo4j service if needed
  try {
    const graph = await prepareGraphService({
      env: process.env,
      homeDir: process.env.OPENTEST_HOME,
      interactive: false,
      confirm: async () => false,
    });
    if (graph.env) {
      // Merge graph service env vars
      Object.assign(process.env, graph.env);
    }
  } catch (error) {
    // Neo4j is optional, just log
    console.log(`ℹ️  图谱服务未启动（可选）: ${error.message}`);
  }

  // Set up environment for pi-web
  const env = {
    ...process.env,
    PORT: String(port),
    PI_WEB_HOSTNAME: hostname,
    PI_WEB_NO_OPEN: noOpen ? '1' : undefined,
    // Point pi-web to OpenTest's config location
    PI_CODING_AGENT_DIR: process.env.OPENTEST_HOME 
      ? `${process.env.OPENTEST_HOME}/pi-agent`
      : undefined,
  };

  // Clean up undefined values
  Object.keys(env).forEach(key => {
    if (env[key] === undefined) delete env[key];
  });

  console.log(`🚀 启动参数：`);
  console.log(`   地址: http://${hostname}:${port}`);
  console.log(`   自动打开浏览器: ${noOpen ? '否' : '是'}`);
  console.log(`   配置目录: ${env.PI_CODING_AGENT_DIR || '~/.pi/agent'}\n`);

  // Launch pi-web
  const webEntry = require.resolve('@agegr/pi-web/bin/pi-web.js');
  const args = [
    webEntry,
    '--port', String(port),
    '--hostname', hostname,
  ];
  if (noOpen) args.push('--no-open');

  const child = spawn('node', args, {
    stdio: 'inherit',
    env,
    cwd: process.cwd(),
  });

  child.on('error', (error) => {
    console.error('❌ pi-web 启动失败:', error.message);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n❌ pi-web 退出，代码: ${code}`);
      process.exit(code);
    }
  });

  // Handle process termination
  const cleanup = () => {
    if (child && !child.killed) {
      console.log('\n👋 正在关闭 Web UI...');
      child.kill();
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);
}

module.exports = { launchWeb };
