'use strict';

/** Canonical provider presets shared by the CLI, config file, and tests. */

const PROVIDERS = ['openrouter', 'deepseek', 'cc-switch', 'ollama', 'custom'];

const DEFAULT_FAILOVER = ['deepseek-prod', 'cc-switch-enterprise', 'free-openrouter'];

const PRESETS = {
  openrouter: {
    profile: 'free-openrouter',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-r1:free',
    temperature: 0.2,
    maxTokens: 4096,
    timeoutMs: 45000,
    description: '免费调试原型环境',
    apiKey: '',
  },
  deepseek: {
    profile: 'deepseek-prod',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    temperature: 0.1,
    maxTokens: 8192,
    timeoutMs: 30000,
    description: '生产级全量用例生成',
    apiKey: '',
  },
  'cc-switch': {
    profile: 'cc-switch-enterprise',
    provider: 'cc-switch',
    baseUrl: 'https://api.ccswitch.com/v1',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.2,
    maxTokens: 4096,
    timeoutMs: 30000,
    description: '企业中转聚合路由',
    apiKey: '',
  },
  ollama: {
    profile: 'local-ollama',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'deepseek-r1:14b',
    temperature: 0.1,
    maxTokens: 4096,
    timeoutMs: 60000,
    description: '内网离线隐私环境',
    apiKey: 'ollama-no-key-required',
  },
  custom: {
    profile: 'custom',
    provider: 'custom',
    baseUrl: '',
    model: '',
    temperature: 0.2,
    maxTokens: 4096,
    timeoutMs: 30000,
    description: '自定义 OpenAI 兼容端点',
    apiKey: '',
  },
};

const PROVIDER_ALIASES = {
  openrouter: 'openrouter',
  'open-router': 'openrouter',
  deepseek: 'deepseek',
  'cc-switch': 'cc-switch',
  ccswitch: 'cc-switch',
  cc_switch: 'cc-switch',
  ollama: 'ollama',
  local: 'ollama',
  custom: 'custom',
};

function normalizeProvider(value) {
  const key = PROVIDER_ALIASES[String(value || '').trim().toLowerCase()];
  if (!key) {
    throw new Error(
      `Unknown provider "${value}". Expected one of: ${PROVIDERS.join(', ')}`
    );
  }
  return key;
}

function presetByProfileName(name) {
  return Object.values(PRESETS).find((preset) => preset.profile === name) || null;
}

function exportPresetCatalog() {
  const profiles = {};
  Object.values(PRESETS).forEach((preset) => {
    profiles[preset.profile] = {
      provider: preset.provider,
      baseUrl: preset.baseUrl,
      apiKey: preset.apiKey,
      model: preset.model,
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
      timeoutMs: preset.timeoutMs,
      description: preset.description,
    };
  });
  return {
    $schema: 'https://raw.githubusercontent.com/miraclebro89757/open-test/main/schemas/llm-config.schema.json',
    active_profile: 'free-openrouter',
    profiles,
    failover_order: DEFAULT_FAILOVER.slice(),
  };
}

module.exports = {
  PROVIDERS,
  DEFAULT_FAILOVER,
  PRESETS,
  normalizeProvider,
  presetByProfileName,
  exportPresetCatalog,
};
