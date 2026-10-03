'use strict';

const assert = require('assert');
const test = require('node:test');
const {
  buildModelsDocument,
  buildModelsScope,
  buildProfileEnv,
  piEnvName,
  piModelRef,
  piProviderId,
  selectableProfiles,
  slugify,
} = require('./pi-models');

const SECRET = 'sk-or-v1-3d9a2f7c4b1e8d6a0f5b2c7e4a9d1f3b6c8e0a2d';

const FREE = {
  name: 'free-openrouter',
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'deepseek/deepseek-r1:free',
  apiKey: SECRET,
  usable: true,
};

const TEAM = {
  name: 'team-deepseek',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-reasoner',
  apiKey: 'sk-deepseek-team-9999',
  usable: true,
};

test('profile names become stable, collision-free provider ids', () => {
  assert.equal(slugify('Free OpenRouter!'), 'free-openrouter');
  assert.equal(piProviderId('free-openrouter'), 'opentest-free-openrouter');
  // Two profiles on one host stay distinct so each keeps its own key.
  assert.notEqual(piProviderId('free'), piProviderId('paid'));
  assert.equal(piEnvName('free-openrouter'), 'OPENTEST_KEY_FREE_OPENROUTER');
  assert.equal(piModelRef(FREE), 'opentest-free-openrouter/deepseek/deepseek-r1:free');
});

test('every usable profile becomes its own pi provider', () => {
  const doc = buildModelsDocument([FREE, TEAM]);
  assert.deepEqual(Object.keys(doc.providers).sort(), [
    'opentest-free-openrouter',
    'opentest-team-deepseek',
  ]);
  assert.equal(doc.providers['opentest-team-deepseek'].baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(doc.providers['opentest-team-deepseek'].models[0].id, 'deepseek-reasoner');
});

test('models.json never contains a key, only env references', () => {
  const text = JSON.stringify(buildModelsDocument([FREE, TEAM]));
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes('sk-deepseek-team-9999'), false);
  assert.equal(buildModelsDocument([FREE]).providers['opentest-free-openrouter'].apiKey, '$OPENTEST_KEY_FREE_OPENROUTER');
});

test('each profile gets its own env var so providers authenticate separately', () => {
  const env = buildProfileEnv([FREE, TEAM]);
  assert.equal(env.OPENTEST_KEY_FREE_OPENROUTER, SECRET);
  assert.equal(env.OPENTEST_KEY_TEAM_DEEPSEEK, 'sk-deepseek-team-9999');
});

test('ollama needs no key and gets the pi sentinel instead', () => {
  const ollama = { ...FREE, name: 'local', provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', apiKey: 'ollama-no-key-required' };
  const doc = buildModelsDocument([ollama]);
  assert.equal(doc.providers['opentest-local'].apiKey, 'ollama');
  assert.equal(buildProfileEnv([ollama]).OPENTEST_KEY_LOCAL, undefined);
});

test('profiles with no model or no usable key are left out of the switch scope', () => {
  const broken = { ...FREE, name: 'broken', model: '', usable: false };
  const noKey = { ...FREE, name: 'nokey', apiKey: '', usable: false };
  assert.deepEqual(selectableProfiles([FREE, broken, noKey]).map((p) => p.name), ['free-openrouter']);
  // One real profile means nothing to cycle, so no scope is emitted.
  assert.equal(buildModelsScope([FREE, broken]), 'opentest-free-openrouter/deepseek/deepseek-r1:free');
  assert.equal(buildModelsScope([]), '');
});

test('the cycling scope lists every profile in provider/id form', () => {
  assert.equal(
    buildModelsScope([FREE, TEAM]),
    'opentest-free-openrouter/deepseek/deepseek-r1:free,opentest-team-deepseek/deepseek-reasoner'
  );
});
