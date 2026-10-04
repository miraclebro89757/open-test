'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const {
  loadSandboxConfig,
  saveSandboxConfig,
  updateLastUsedUrl,
  switchEnvironment,
  listEnvironments,
  isValidUrl,
  getConfigPath,
} = require('./sandbox-config');

test('isValidUrl validates http and https URLs', () => {
  assert.strictEqual(isValidUrl('https://example.com'), true);
  assert.strictEqual(isValidUrl('http://localhost:8080'), true);
  assert.strictEqual(isValidUrl('https://demo.example.com:3000/path'), true);
  
  assert.strictEqual(isValidUrl(''), false);
  assert.strictEqual(isValidUrl('ftp://example.com'), false);
  assert.strictEqual(isValidUrl('not-a-url'), false);
  assert.strictEqual(isValidUrl(null), false);
});

test('saveSandboxConfig creates config file', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'opentest-sandbox-'));
  
  const config = {
    defaultUrl: 'https://demo.example.com',
    environments: {
      dev: 'https://dev.example.com',
      test: 'https://test.example.com',
    },
    activeEnvironment: 'dev',
    lastUsedUrl: 'https://dev.example.com',
  };
  
  await saveSandboxConfig(workspace, config);
  
  const configPath = getConfigPath(workspace);
  const exists = await fs.access(configPath).then(() => true).catch(() => false);
  assert.strictEqual(exists, true);
  
  const content = await fs.readFile(configPath, 'utf8');
  const saved = JSON.parse(content);
  
  assert.strictEqual(saved.defaultUrl, config.defaultUrl);
  assert.strictEqual(saved.activeEnvironment, config.activeEnvironment);
  assert.ok(saved.$comment); // Has comment
});

test('loadSandboxConfig reads config file', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'opentest-sandbox-'));
  
  const config = {
    defaultUrl: 'https://demo.example.com',
    lastUsedUrl: 'https://demo.example.com',
  };
  
  await saveSandboxConfig(workspace, config);
  const loaded = await loadSandboxConfig(workspace);
  
  assert.strictEqual(loaded.defaultUrl, config.defaultUrl);
  assert.strictEqual(loaded.lastUsedUrl, config.lastUsedUrl);
});

test('loadSandboxConfig returns null for missing config', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'opentest-sandbox-'));
  const config = await loadSandboxConfig(workspace);
  
  assert.strictEqual(config, null);
});

test('updateLastUsedUrl updates only lastUsedUrl', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'opentest-sandbox-'));
  
  const config = {
    defaultUrl: 'https://demo.example.com',
    lastUsedUrl: 'https://demo.example.com',
  };
  
  await saveSandboxConfig(workspace, config);
  await updateLastUsedUrl(workspace, 'https://new.example.com');
  
  const updated = await loadSandboxConfig(workspace);
  assert.strictEqual(updated.lastUsedUrl, 'https://new.example.com');
  assert.strictEqual(updated.defaultUrl, 'https://demo.example.com'); // Unchanged
});

test('switchEnvironment changes active environment', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'opentest-sandbox-'));
  
  const config = {
    environments: {
      dev: 'https://dev.example.com',
      test: 'https://test.example.com',
    },
    activeEnvironment: 'dev',
  };
  
  await saveSandboxConfig(workspace, config);
  await switchEnvironment(workspace, 'test');
  
  const updated = await loadSandboxConfig(workspace);
  assert.strictEqual(updated.activeEnvironment, 'test');
});

test('switchEnvironment throws for non-existent environment', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'opentest-sandbox-'));
  
  const config = {
    environments: {
      dev: 'https://dev.example.com',
    },
    activeEnvironment: 'dev',
  };
  
  await saveSandboxConfig(workspace, config);
  
  await assert.rejects(
    () => switchEnvironment(workspace, 'prod'),
    /环境 "prod" 不存在/
  );
});

test('listEnvironments returns all environments', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'opentest-sandbox-'));
  
  const config = {
    defaultUrl: 'https://demo.example.com',
    environments: {
      dev: 'https://dev.example.com',
      test: 'https://test.example.com',
    },
    activeEnvironment: 'dev',
  };
  
  await saveSandboxConfig(workspace, config);
  const envs = await listEnvironments(workspace);
  
  assert.strictEqual(envs.length, 3); // default + dev + test
  
  const devEnv = envs.find(e => e.name === 'dev');
  assert.strictEqual(devEnv.url, 'https://dev.example.com');
  assert.strictEqual(devEnv.active, true);
  
  const testEnv = envs.find(e => e.name === 'test');
  assert.strictEqual(testEnv.active, false);
});

test('listEnvironments returns empty for missing config', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'opentest-sandbox-'));
  const envs = await listEnvironments(workspace);
  
  assert.strictEqual(envs.length, 0);
});

test('getConfigPath returns correct path', () => {
  const workspace = '/path/to/workspace';
  const configPath = getConfigPath(workspace);
  
  assert.ok(configPath.includes('workspace'));
  assert.ok(configPath.endsWith('opentest.sandbox.json'));
});
