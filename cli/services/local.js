'use strict';

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BOLT_PORT = 7687;
const NEO4J_IMAGE = 'neo4j:5.24-community';
const NEO4J_MIRROR = 'm.daocloud.io/docker.io/library/neo4j:5.24-community';

function servicesDir(homeDir) {
  return path.join(homeDir || os.homedir(), '.opentest');
}

function servicesFile(homeDir) {
  return path.join(servicesDir(homeDir), 'services.json');
}

function composeFile() {
  return path.join(__dirname, 'compose.yml');
}

function readService(homeDir) {
  const file = servicesFile(homeDir);
  if (!fs.existsSync(file)) return null;
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const neo4j = saved && saved.neo4j;
  if (!neo4j || !neo4j.uri || !neo4j.user || !neo4j.password) return null;
  return neo4j;
}

function writeService(homeDir, neo4j) {
  const dir = servicesDir(homeDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = servicesFile(homeDir);
  fs.writeFileSync(file, `${JSON.stringify({ neo4j }, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return neo4j;
}

function createService(homeDir) {
  return writeService(homeDir, {
    uri: `bolt://127.0.0.1:${BOLT_PORT}`,
    user: 'neo4j',
    password: crypto.randomBytes(18).toString('base64url'),
    browser: 'http://127.0.0.1:7474',
  });
}

function portOpen(port = BOLT_PORT, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(400);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function composeArgs() {
  return ['compose', '-f', composeFile(), '-p', 'opentest'];
}

function commandFailed(error) {
  return `${error.message || ''}\n${error.stderr || ''}`;
}

function registryFailed(error) {
  return /deadline exceeded|failed to resolve|registry-1\.docker\.io|TLS handshake|i\/o timeout|connection reset|no such host|context deadline/i.test(commandFailed(error));
}

function imagePresent(execFile) {
  try {
    execFile('docker', ['image', 'inspect', NEO4J_IMAGE], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ensureNeo4jImage(execFile) {
  if (imagePresent(execFile)) return;
  try {
    execFile('docker', ['pull', NEO4J_IMAGE], { stdio: 'inherit' });
  } catch (error) {
    if (error.code === 'ENOENT') throw error;
    if (!registryFailed(error)) throw error;
    execFile('docker', ['pull', NEO4J_MIRROR], { stdio: 'inherit' });
    execFile('docker', ['tag', NEO4J_MIRROR, NEO4J_IMAGE], { stdio: 'inherit' });
  }
}

function publicMessage(neo4j, started) {
  const state = started ? 'Neo4j 已启动。' : 'Neo4j 已在运行。';
  return `${state}\n浏览器 ${neo4j.browser || 'http://127.0.0.1:7474'}\nBolt ${neo4j.uri}\n账号 ${neo4j.user}\n连接写在 ~/.opentest/services.json，打开 agent 时会自动带上。`;
}

async function waitForBolt(probe, attempts = 45) {
  for (let i = 0; i < attempts; i += 1) {
    if (await probe(BOLT_PORT)) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Neo4j 容器已创建，但 7687 还没有就绪。查看日志：npx open-test services logs');
}

async function startGraphService({
  homeDir,
  execFile = execFileSync,
  probe = portOpen,
} = {}) {
  if (await probe(BOLT_PORT)) {
    const existing = readService(homeDir);
    if (!existing) {
      throw new Error('7687 已被占用，但没有已保存的连接。先停下占用端口的程序，或自行设置 NEO4J_URI、NEO4J_USER、NEO4J_PASSWORD。');
    }
    return { ...existing, started: false, message: publicMessage(existing, false) };
  }
  const neo4j = readService(homeDir) || createService(homeDir);
  try {
    ensureNeo4jImage(execFile);
    execFile('docker', [...composeArgs(), 'up', '-d', 'neo4j'], {
      env: { ...process.env, NEO4J_AUTH: `${neo4j.user}/${neo4j.password}` },
      stdio: 'inherit',
    });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('没有找到 Docker。安装并打开 Docker 后运行：npx open-test services');
    if (!registryFailed(error)) throw error;
    execFile('docker', ['pull', NEO4J_MIRROR], { stdio: 'inherit' });
    execFile('docker', ['tag', NEO4J_MIRROR, NEO4J_IMAGE], { stdio: 'inherit' });
    execFile('docker', [...composeArgs(), 'up', '-d', 'neo4j'], {
      env: { ...process.env, NEO4J_AUTH: `${neo4j.user}/${neo4j.password}` },
      stdio: 'inherit',
    });
  }
  await waitForBolt(probe);
  return { ...neo4j, started: true, message: publicMessage(neo4j, true) };
}

function stopGraphService({ execFile = execFileSync } = {}) {
  execFile('docker', [...composeArgs(), 'stop', 'neo4j'], { stdio: 'inherit' });
}

function logGraphService({ execFile = execFileSync } = {}) {
  execFile('docker', [...composeArgs(), 'logs', 'neo4j'], { stdio: 'inherit' });
}

function graphEnv(homeDir, env = process.env) {
  if (env.NEO4J_URI && env.NEO4J_USER && env.NEO4J_PASSWORD) return {};
  const saved = readService(homeDir);
  if (!saved) return {};
  return {
    NEO4J_URI: saved.uri,
    NEO4J_USER: saved.user,
    NEO4J_PASSWORD: saved.password,
  };
}

async function prepareGraphService({
  env = process.env,
  homeDir,
  interactive = false,
  confirm = async () => false,
  start = startGraphService,
  probe = portOpen,
} = {}) {
  if (env.NEO4J_URI && env.NEO4J_USER && env.NEO4J_PASSWORD) {
    return { env, message: `图谱服务 ${env.NEO4J_URI}` };
  }
  const open = await probe(BOLT_PORT);
  const saved = readService(homeDir);
  if (!open && interactive) {
    const yes = await confirm('本机没有 Neo4j，图谱只会写在产品目录。现在启动？[y/N] ');
    if (yes) {
      try {
        const started = await start({ homeDir, probe });
        return {
          env: { ...env, NEO4J_URI: started.uri, NEO4J_USER: started.user, NEO4J_PASSWORD: started.password },
          message: started.message,
        };
      } catch (error) {
        return { env, message: `${error.message}\n图谱先写在产品目录。` };
      }
    }
  }
  if (open && saved) {
    return {
      env: { ...env, NEO4J_URI: saved.uri, NEO4J_USER: saved.user, NEO4J_PASSWORD: saved.password },
      message: `图谱服务 ${saved.uri}`,
    };
  }
  if (open) {
    return { env, message: '7687 已有服务，但没有连接信息。设置 NEO4J_URI、NEO4J_USER、NEO4J_PASSWORD。' };
  }
  return { env, message: '图谱服务未启动。一键启动：npx open-test services' };
}

module.exports = {
  composeFile,
  servicesFile,
  readService,
  graphEnv,
  prepareGraphService,
  startGraphService,
  stopGraphService,
  logGraphService,
  portOpen,
};
