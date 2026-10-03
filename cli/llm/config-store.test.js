'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { exportPresetCatalog, PROVIDERS, PROVIDER_GUIDE } = require('./presets');
const {
  formatConfigList,
  maskKey,
  resolveLLMConfig,
  sanitizeApiKey,
  normalizeTaskId,
  readTaskModels,
  taskForStep,
  useProfile,
  validateApiKeyInput,
  writeProfile,
  writeTaskModel,
} = require('./config-store');

function isolated() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-llm-'));
  return {
    cwd: path.join(root, 'project'),
    homeDir: path.join(root, 'home'),
    env: {},
  };
}

test('project application baseUrl is not treated as the LLM endpoint', () => {
  const resolved = resolveLLMConfig({
    env: { OPENAI_API_KEY: 'sk-real-openai-key-123456' },
    projectDoc: {
      name: 'demo',
      baseUrl: 'http://localhost:3000',
      tests: { directory: './tests' },
    },
    userDoc: null,
  });

  assert.equal(resolved.config.baseUrl, 'https://api.openai.com/v1');
  assert.equal(resolved.config.model, 'gpt-4o-mini');
  assert.equal(resolved.config.apiKey, 'sk-real-openai-key-123456');
  assert.equal(resolved.activeProfile, 'env');
});

test('a real project key beats the environment', () => {
  const resolved = resolveLLMConfig({
    env: { OPENTEST_API_KEY: 'sk-env-key-should-lose-9999' },
    projectDoc: {
      active_profile: 'deepseek-prod',
      profiles: {
        'deepseek-prod': {
          provider: 'deepseek',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-project-deepseek-key-1234',
          model: 'deepseek-chat',
        },
      },
    },
    userDoc: {
      active_profile: 'free-openrouter',
      profiles: {
        'deepseek-prod': { apiKey: 'sk-user-key-should-lose-8888' },
      },
    },
  });

  assert.equal(resolved.activeProfile, 'deepseek-prod');
  assert.equal(resolved.profileSource, 'project');
  assert.equal(resolved.config.apiKey, 'sk-project-deepseek-key-1234');
  assert.equal(resolved.config.model, 'deepseek-chat');
});

test('placeholder project key falls through to the environment', () => {
  const resolved = resolveLLMConfig({
    env: { OPENTEST_API_KEY: 'sk-real-deepseek-key-1234' },
    projectDoc: {
      active_profile: 'deepseek-prod',
      profiles: {
        'deepseek-prod': {
          provider: 'deepseek',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-xxxxxxxxxxxxxxxxxxxx',
          model: 'deepseek-chat',
        },
      },
    },
    userDoc: null,
  });

  assert.equal(resolved.config.apiKey, 'sk-real-deepseek-key-1234');
  assert.equal(resolved.config.baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(resolved.config.provider, 'deepseek');
});

test('cli overrides outrank the project file', () => {
  const resolved = resolveLLMConfig({
    env: {},
    overrides: {
      profile: 'free-openrouter',
      apiKey: 'sk-or-v1-cli-key-abcdef',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
    },
    projectDoc: {
      active_profile: 'deepseek-prod',
      profiles: {
        'deepseek-prod': {
          provider: 'deepseek',
          apiKey: 'sk-project-deepseek-key-1234',
          model: 'deepseek-chat',
          baseUrl: 'https://api.deepseek.com/v1',
        },
      },
    },
    userDoc: null,
  });

  assert.equal(resolved.activeProfile, 'free-openrouter');
  assert.equal(resolved.profileSource, 'cli');
  assert.equal(resolved.config.apiKey, 'sk-or-v1-cli-key-abcdef');
  assert.equal(resolved.config.model, 'meta-llama/llama-3.3-70b-instruct:free');
  assert.equal(resolved.config.baseUrl, 'https://openrouter.ai/api/v1');
});

test('failover chain starts at the active profile and does not duplicate it', () => {
  const resolved = resolveLLMConfig({
    env: {},
    projectDoc: {
      active_profile: 'deepseek-prod',
      failover_order: ['deepseek-prod', 'cc-switch-enterprise', 'free-openrouter'],
      profiles: {
        'deepseek-prod': {
          provider: 'deepseek',
          apiKey: 'sk-project-deepseek-key-1234',
          model: 'deepseek-chat',
          baseUrl: 'https://api.deepseek.com/v1',
        },
        'free-openrouter': {
          provider: 'openrouter',
          apiKey: 'sk-or-v1-real-key-abcdef',
          model: 'deepseek/deepseek-r1:free',
          baseUrl: 'https://openrouter.ai/api/v1',
        },
      },
    },
    userDoc: null,
  });

  assert.deepEqual(
    resolved.chain.map((item) => item.name),
    ['deepseek-prod', 'cc-switch-enterprise', 'free-openrouter']
  );
  assert.equal(resolved.chain[1].config.usable, undefined);
  assert.equal(resolved.profiles.find((item) => item.name === 'cc-switch-enterprise').usable, false);
});

test('env profile does not replace a named preset endpoint', () => {
  const resolved = resolveLLMConfig({
    env: { OPENAI_API_KEY: 'sk-real-openai-key-123456' },
    projectDoc: {
      active_profile: 'free-openrouter',
      profiles: {
        'free-openrouter': {
          provider: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'deepseek/deepseek-r1:free',
          apiKey: '',
        },
      },
    },
    userDoc: null,
  });

  assert.equal(resolved.config.provider, 'openrouter');
  assert.equal(resolved.config.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(resolved.config.apiKey, 'sk-real-openai-key-123456');
});

test('writeProfile keeps project settings and useProfile switches the active name', () => {
  const isolatedPaths = isolated();
  fs.mkdirSync(isolatedPaths.cwd, { recursive: true });
  fs.writeFileSync(
    path.join(isolatedPaths.cwd, 'opentest.config.json'),
    JSON.stringify({
      name: 'demo',
      baseUrl: 'http://localhost:3000',
      tests: { directory: './tests' },
    })
  );

  const written = writeProfile({
    ...isolatedPaths,
    scope: 'project',
    profileName: 'deepseek-prod',
    profile: {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-project-deepseek-key-1234',
      model: 'deepseek-chat',
    },
  });
  assert.match(written.warning, /gitignore/);

  writeProfile({
    ...isolatedPaths,
    scope: 'project',
    profileName: 'free-openrouter',
    profile: {
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-v1-real-key-abcdef',
      model: 'deepseek/deepseek-r1:free',
    },
    activate: false,
  });

  const switched = useProfile({
    ...isolatedPaths,
    scope: 'project',
    profileName: 'free-openrouter',
  });
  assert.equal(switched.activeProfile, 'free-openrouter');

  const saved = JSON.parse(fs.readFileSync(path.join(isolatedPaths.cwd, 'opentest.config.json'), 'utf8'));
  assert.equal(saved.name, 'demo');
  assert.equal(saved.baseUrl, 'http://localhost:3000');
  assert.equal(saved.tests.directory, './tests');
  assert.equal(saved.active_profile, 'free-openrouter');

  const resolved = resolveLLMConfig(isolatedPaths);
  assert.equal(resolved.config.apiKey, 'sk-or-v1-real-key-abcdef');
  const listed = formatConfigList(resolved);
  assert.equal(listed.includes(maskKey('sk-or-v1-real-key-abcdef')), true);
  assert.equal(listed.includes('sk-or-v1-real-key-abcdef'), false);
  assert.equal(maskKey('sk-project-deepseek-key-1234').includes('deepseek-key'), false);
});

test('an unused custom profile does not inherit the OpenAI fallback model', () => {
  const resolved = resolveLLMConfig({
    env: {},
    projectDoc: {
      active_profile: 'free-openrouter',
      profiles: {
        'free-openrouter': {
          provider: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'deepseek/deepseek-r1:free',
          apiKey: '',
        },
        custom: { provider: 'custom', baseUrl: '', model: '', apiKey: '' },
      },
    },
    userDoc: null,
  });
  const custom = resolved.profiles.find((item) => item.name === 'custom');
  assert.equal(custom.model, '');
  assert.equal(resolved.config.model, 'deepseek/deepseek-r1:free');
});

test('apiKey can reference an environment variable', () => {
  const resolved = resolveLLMConfig({
    env: { OPENTEST_API_KEY: 'sk-from-env-var-123456' },
    projectDoc: {
      active_profile: 'deepseek-prod',
      profiles: {
        'deepseek-prod': {
          provider: 'deepseek',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: '${OPENTEST_API_KEY}',
          model: 'deepseek-chat',
        },
      },
    },
    userDoc: null,
  });
  assert.equal(resolved.config.apiKey, 'sk-from-env-var-123456');
});

test('unknown profile use fails', () => {
  const isolatedPaths = isolated();
  assert.throws(
    () => useProfile({ ...isolatedPaths, profileName: 'missing' }),
    /Unknown profile/
  );
});

test('the exported preset catalog matches the documented providers', () => {
  const catalog = exportPresetCatalog();

  assert.equal(catalog.active_profile, 'free-openrouter');
  assert.deepEqual(catalog.failover_order, ['deepseek-prod', 'cc-switch-enterprise', 'free-openrouter']);
  assert.deepEqual(
    Object.values(catalog.profiles).map((profile) => profile.provider).sort(),
    ['cc-switch', 'custom', 'deepseek', 'ollama', 'openrouter']
  );

  // Every preset except `custom` must be usable without further configuration.
  for (const [name, profile] of Object.entries(catalog.profiles)) {
    if (name === 'custom') continue;
    assert.ok(profile.baseUrl, `${name} has no baseUrl`);
    assert.ok(profile.model, `${name} has no model`);
  }
});

test('every failover target names a preset that exists', () => {
  const catalog = exportPresetCatalog();
  for (const name of catalog.failover_order) {
    assert.ok(catalog.profiles[name], `failover_order references unknown profile ${name}`);
  }
});

// --- API key paste handling ----------------------------------------------------

test('pasted keys are cleaned before they are stored', () => {
  // People copy keys out of web pages, curl commands, and JSON files.
  assert.equal(sanitizeApiKey('  sk-abc123  '), 'sk-abc123');
  assert.equal(sanitizeApiKey('Bearer sk-abc123'), 'sk-abc123');
  assert.equal(sanitizeApiKey('bearer   sk-abc123'), 'sk-abc123');
  assert.equal(sanitizeApiKey('"sk-abc123"'), 'sk-abc123');
  assert.equal(sanitizeApiKey("'sk-abc123'"), 'sk-abc123');
  assert.equal(sanitizeApiKey('\nsk-abc123\n'), 'sk-abc123');
  assert.equal(sanitizeApiKey('Bearer "sk-abc123"'), 'sk-abc123');
  assert.equal(sanitizeApiKey(undefined), '');
  assert.equal(sanitizeApiKey('   '), '');
});

test('a clean real-looking key passes validation', () => {
  assert.equal(validateApiKeyInput('sk-3d9a2f7c4b1e8d6a0f5b2c7e4a9d1f3b6c8e0a2d'), true);
  assert.equal(validateApiKeyInput('sk-or-v1-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b'), true);
});

test('validation explains each way a paste goes wrong', () => {
  assert.match(validateApiKeyInput(''), /请填写 API key/);
  assert.match(validateApiKeyInput('   '), /请填写 API key/);
  // Bearer/quotes are repaired, so they must NOT be rejected.
  assert.equal(validateApiKeyInput('Bearer "sk-3d9a2f7c4b1e8d6a0f5b2c7e4a9d1f3b6c8e0a2d"'), true);

  assert.match(
    validateApiKeyInput('{"api_key": "sk-3d9a2f7c4b1e8d6a0f5b2c7e4a9d1f3b6c8e0a2d"}'),
    /引号或括号/
  );
  assert.match(validateApiKeyInput('sk-3d9a 2f7c4b1e8d6a0f5b2c7e4a9d1f3b6c8e0a2d'), /空格/);
  assert.match(validateApiKeyInput('sk-xxxx'), /示例占位符/);
  assert.match(validateApiKeyInput('your-api-key-here'), /示例占位符/);
  assert.match(validateApiKeyInput('sk-tooshort'), /复制完整/);
});

// --- wizard guidance -----------------------------------------------------------

test('every provider has wizard guidance with a usable example', () => {
  for (const id of PROVIDERS) {
    const guide = PROVIDER_GUIDE[id];
    assert.ok(guide, `${id} is missing PROVIDER_GUIDE`);
    assert.ok(guide.label, `${id} needs a label`);
    assert.ok(guide.blurb, `${id} needs a blurb`);
    assert.equal(typeof guide.needsKey, 'boolean', `${id} needs needsKey`);
    assert.ok(guide.modelExample, `${id} needs a modelExample`);
    assert.ok(guide.baseUrlExample, `${id} needs a baseUrlExample`);
    if (guide.needsKey) {
      assert.ok(guide.keyExample, `${id} needs a keyExample`);
      assert.ok(guide.keySteps, `${id} needs keySteps`);
    }
  }
  assert.equal(PROVIDER_GUIDE.ollama.needsKey, false);
  assert.ok(PROVIDER_GUIDE.openrouter.keyUrl.startsWith('https://'));
  assert.ok(PROVIDER_GUIDE.deepseek.keyUrl.startsWith('https://'));
});

test('key examples look like keys but are not mistaken for real ones', () => {
  // An example the user could paste must be rejected, never silently stored.
  for (const id of PROVIDERS) {
    const guide = PROVIDER_GUIDE[id];
    if (!guide.needsKey) continue;
    const bare = guide.keyExample.replace(/[…]/g, '');
    assert.match(bare, /^(sk-or-|sk-)/, `${id} example should show the real prefix`);
    assert.ok(bare.length < 30, `${id} example must stay short enough to read`);
  }
});

// --- which profiles actually exist on disk ------------------------------------

test('failover placeholders are listed but marked as not saved', () => {
  const env = isolated();
  writeProfile({
    ...env,
    scope: 'user',
    profileName: 'mine',
    profile: {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'sk-3d9a2f7c4b1e8d6a0f5b2c7e4a9d1f3b6c8e0a2d',
    },
  });

  const resolved = resolveLLMConfig(env);
  const mine = resolved.profiles.find((item) => item.name === 'mine');
  assert.equal(mine.saved, true);

  // The default failover chain names presets that were never written.
  const phantoms = resolved.profiles.filter((item) => !item.saved);
  assert.ok(phantoms.length > 0, 'failover chain should still be visible');
  phantoms.forEach((item) => {
    assert.equal(item.saved, false, `${item.name} must not look switchable`);
  });
  assert.equal(resolved.profiles.filter((item) => item.saved).length, 1);
});

test('formatProfileChoice marks the active profile and never carries the key', () => {
  const { formatProfileChoice } = require('./config-store');
  const label = formatProfileChoice({
    name: 'mine',
    provider: 'deepseek',
    model: 'deepseek-chat',
    maskedKey: 'sk-3d9…0a2d',
    usable: true,
    saved: true,
  }, true);
  assert.match(label, /^✅/);
  assert.equal(label.includes('3d9a2f7c'), false);
});

test('task names accept the words people actually type', () => {
  assert.equal(normalizeTaskId('requirementAnalysis'), 'requirementAnalysis');
  assert.equal(normalizeTaskId('需求分析'), 'requirementAnalysis');
  assert.equal(normalizeTaskId('需求'), 'requirementAnalysis');
  // A near-miss on the label must still route rather than error out.
  assert.equal(normalizeTaskId('报告生成'), 'reportGeneration');
  assert.equal(normalizeTaskId('测试报告'), 'reportGeneration');
  assert.equal(normalizeTaskId('report-generation'), 'reportGeneration');
  assert.equal(normalizeTaskId('用例生成'), 'testCaseGeneration');
  assert.equal(normalizeTaskId('缺陷'), 'bugAnalysis');
  assert.equal(normalizeTaskId(''), '');
  assert.equal(normalizeTaskId('瞎写'), '');
});

test('each step command belongs to the task that should drive its model', () => {
  assert.equal(taskForStep('analyze').id, 'requirementAnalysis');
  assert.equal(taskForStep('cases').id, 'testCaseGeneration');
  assert.equal(taskForStep('record').id, 'codeGeneration');
  assert.equal(taskForStep('heal').id, 'codeGeneration');
  assert.equal(taskForStep('defects').id, 'bugAnalysis');
  assert.equal(taskForStep('report').id, 'reportGeneration');
  // Status is a read-only view; it should never drag a task model along.
  assert.equal(taskForStep('status'), null);
});

test('task routing persists, merges layers, and can be cleared', () => {
  const box = isolated();
  writeTaskModel({ ...box, scope: 'user', task: 'bugAnalysis', profileName: 'strong' });
  writeTaskModel({ ...box, scope: 'user', task: '报告生成', profileName: 'cheap' });
  assert.deepEqual(readTaskModels(box), { bugAnalysis: 'strong', reportGeneration: 'cheap' });

  // Project config wins over user config for the same task.
  writeTaskModel({ ...box, scope: 'project', task: 'bugAnalysis', profileName: 'pinned' });
  assert.deepEqual(readTaskModels(box), { bugAnalysis: 'pinned', reportGeneration: 'cheap' });

  // Clearing removes the pin so the task follows the session model again.
  writeTaskModel({ ...box, scope: 'project', task: 'bugAnalysis', profileName: '' });
  assert.deepEqual(readTaskModels(box), { bugAnalysis: 'strong', reportGeneration: 'cheap' });

  assert.throws(
    () => writeTaskModel({ ...box, scope: 'user', task: 'nope', profileName: 'x' }),
    /Unknown task/
  );
});

test('resolveLLMConfig surfaces the routing map alongside the profiles', () => {
  const box = isolated();
  writeProfile({
    ...box,
    scope: 'user',
    profileName: 'strong',
    profile: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner', apiKey: 'sk-strong-1234' },
  });
  writeTaskModel({ ...box, scope: 'user', task: 'requirementAnalysis', profileName: 'strong' });
  const resolved = resolveLLMConfig(box);
  assert.deepEqual(resolved.taskModels, { requirementAnalysis: 'strong' });
});
