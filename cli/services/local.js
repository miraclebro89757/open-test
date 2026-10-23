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
  const state = started ? 'Neo4j started.' : 'Neo4j is already running.';
  return `${state}\nBrowser ${neo4j.browser || 'http://127.0.0.1:7474'}\nBolt ${neo4j.uri}\nUser ${neo4j.user}\nThe connection is in ~/.opentest/services.json and is loaded when the agent starts.`;
}

async function waitForBolt(probe, attempts = 45) {
  for (let i = 0; i < attempts; i += 1) {
    if (await probe(BOLT_PORT)) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('The Neo4j container was created, but port 7687 is not ready. See the logs: npx open-test services logs');
}

async function startGraphService({
  homeDir,
  execFile = execFileSync,
  probe = portOpen,
} = {}) {
  if (await probe(BOLT_PORT)) {
    const existing = readService(homeDir);
    if (!existing) {
      throw new Error('Port 7687 is in use, and no saved connection was found. Stop the program using that port, or set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD.');
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
    if (error.code === 'ENOENT') throw new Error('Docker was not found. Install and start Docker, then run: npx open-test services');
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
    return { env, message: `Graph service ${env.NEO4J_URI}` };
  }
  const open = await probe(BOLT_PORT);
  const saved = readService(homeDir);
  if (!open && interactive) {
    const yes = await confirm('Neo4j is not running, so the graph will only be written in the product folder. Start it now? [y/N] ');
    if (yes) {
      try {
        const started = await start({ homeDir, probe });
        return {
          env: { ...env, NEO4J_URI: started.uri, NEO4J_USER: started.user, NEO4J_PASSWORD: started.password },
          message: started.message,
        };
      } catch (error) {
        return { env, message: `${error.message}\nThe graph will be written in the product folder for now.` };
      }
    }
  }
  if (open && saved) {
    return {
      env: { ...env, NEO4J_URI: saved.uri, NEO4J_USER: saved.user, NEO4J_PASSWORD: saved.password },
      message: `Graph service ${saved.uri}`,
    };
  }
  if (open) {
    return { env, message: 'Something is already listening on 7687, but there is no connection info. Set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD.' };
  }
  return { env, message: 'The graph service is not running. Start it with: npx open-test services' };
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
