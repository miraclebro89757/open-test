'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { agentDir, readPiModel, resolveKeyValue, describeModel } = require('./pi-config');
const { createLLMClient } = require('./tools/llm-client');

const SECRET = 'sk-test-0123456789abcdef-secret';

function piHome({ settings, models } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-piconf-'));
  const dir = path.join(home, '.pi', 'agent');
  fs.mkdirSync(dir, { recursive: true });
  if (settings) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings));
  if (models) fs.writeFileSync(path.join(dir, 'models.json'), JSON.stringify(models));
  return home;
}

const SILICON = {
  providers: {
    siliconflow: {
      baseUrl: 'https://api.siliconflow.cn/v1',
      api: 'openai-completions',
      apiKey: SECRET,
      models: [{ id: 'deepseek-ai/DeepSeek-V4-Pro' }],
    },
  },
};

test('agent directory follows PI_CODING_AGENT_DIR, else ~/.pi/agent', () => {
  assert.equal(agentDir({ env: {}, homeDir: '/h' }), path.join('/h', '.pi', 'agent'));
  assert.equal(agentDir({ env: { PI_CODING_AGENT_DIR: '/x/agent' }, homeDir: '/h' }), '/x/agent');
  assert.equal(agentDir({ env: { PI_CODING_AGENT_DIR: '~/a' }, homeDir: '/h' }), path.join('/h', 'a'));
});

test('the default model comes from the same settings Pi Web writes', () => {
  const home = piHome({
    settings: { defaultProvider: 'siliconflow', defaultModel: 'deepseek-ai/DeepSeek-V4-Pro' },
    models: SILICON,
  });
  const info = readPiModel({ env: {}, homeDir: home });
  assert.equal(info.configured, true);
  assert.equal(info.provider, 'siliconflow');
  assert.equal(info.model, 'deepseek-ai/DeepSeek-V4-Pro');
  assert.equal(info.direct.baseUrl, 'https://api.siliconflow.cn/v1');
});

test('the model line shows a mask and never the key', () => {
  const home = piHome({
    settings: { defaultProvider: 'siliconflow', defaultModel: 'm' },
    models: SILICON,
  });
  const info = readPiModel({ env: {}, homeDir: home });
  const line = describeModel(info);
  assert.equal(line.includes(SECRET), false);
  assert.equal(JSON.stringify({ ...info, direct: undefined }).includes(SECRET), false);
  assert.match(line, /siliconflow · m · sk-…cret/);
});

test('nothing configured is reported as such, with no invented model', () => {
  const home = piHome();
  const info = readPiModel({ env: {}, homeDir: home });
  assert.equal(info.configured, false);
  assert.equal(info.direct, null);
  assert.equal(describeModel(info), '还没有默认模型');
});

test('keys written as $ENV resolve from the environment, commands are not run', () => {
  assert.deepEqual(resolveKeyValue('$MY_KEY', { MY_KEY: 'abc' }), { value: 'abc', kind: 'env' });
  assert.deepEqual(resolveKeyValue('${MY_KEY}', { MY_KEY: 'abc' }), { value: 'abc', kind: 'env' });
  assert.equal(resolveKeyValue('$MISSING', {}).kind, 'missing-env');
  assert.deepEqual(resolveKeyValue('!pass show key', {}), { value: '', kind: 'command' });
  assert.equal(resolveKeyValue('literal-key', {}).kind, 'literal');
});

test('a key that comes from a shell command gives no direct client', async () => {
  const home = piHome({
    settings: { defaultProvider: 'siliconflow', defaultModel: 'm' },
    models: { providers: { siliconflow: { baseUrl: 'https://x/v1', apiKey: '!security find-generic-password' } } },
  });
  assert.equal(await createLLMClient({ env: {}, homeDir: home }), null);
});

test('the direct client uses the Pi Web model and never exposes the key', async () => {
  const home = piHome({
    settings: { defaultProvider: 'siliconflow', defaultModel: 'deepseek-ai/DeepSeek-V4-Pro' },
    models: SILICON,
  });
  const client = await createLLMClient({ env: {}, homeDir: home });
  assert.equal(client.activeProfile, 'siliconflow/deepseek-ai/DeepSeek-V4-Pro');
  assert.equal(client.config.baseUrl, 'https://api.siliconflow.cn/v1');
});

test('no client is built when nothing is configured', async () => {
  assert.equal(await createLLMClient({ env: {}, homeDir: piHome() }), null);
});
