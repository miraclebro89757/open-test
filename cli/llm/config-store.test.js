'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { exportPresetCatalog } = require('./presets');
const {
  formatConfigList,
  maskKey,
  resolveLLMConfig,
  useProfile,
  writeProfile,
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
