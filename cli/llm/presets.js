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

/**
 * Wording for the interactive wizard: where to get a key, what a real one looks
 * like, and what to type. Kept separate from PRESETS because PRESETS is
 * serialized into opentest.config.example.json — hints must not leak into the
 * machine-readable catalog.
 */
const PROVIDER_GUIDE = {
  openrouter: {
    label: 'OpenRouter',
    blurb: '有免费额度，第一次配置先用它最省事，不用花钱',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/settings/keys',
    keySteps: '打开上面的网址 → 点 Create new key → 复制那串以 sk-or- 开头的字符',
    keyExample: 'sk-or-v1-1a2b3c4d5e6f7a8b…',
    modelExample: 'deepseek/deepseek-r1:free',
    baseUrlExample: 'https://openrouter.ai/api/v1',
  },
  deepseek: {
    label: 'DeepSeek 官方',
    blurb: '中文效果好、单价低，正式批量生成用例推荐它',
    needsKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keySteps: '打开上面的网址 → 点 创建 API key → 复制那串以 sk- 开头的字符',
    keyExample: 'sk-3d9a2f7c4b1e8d6a0f5b…',
    modelExample: 'deepseek-chat',
    baseUrlExample: 'https://api.deepseek.com/v1',
  },
  'cc-switch': {
    label: 'CC Switch / 企业中转',
    blurb: '公司统一采购的聚合网关，key 由管理员发给你',
    needsKey: true,
    keyUrl: '',
    keySteps: '找公司要网关地址和 key，一般以 sk- 开头；没有就选 DeepSeek 或 OpenRouter',
    keyExample: 'sk-1a2b3c4d5e6f7a8b…',
    modelExample: 'claude-3-5-sonnet-20241022',
    baseUrlExample: 'https://api.ccswitch.com/v1',
  },
  ollama: {
    label: 'Ollama 本地模型',
    blurb: '完全离线、不需要 key，数据不出本机',
    needsKey: false,
    keyUrl: '',
    keySteps: '',
    keyExample: '',
    modelExample: 'deepseek-r1:14b',
    baseUrlExample: 'http://localhost:11434/v1',
  },
  custom: {
    label: '自定义 OpenAI 兼容接口',
    blurb: '任何别人给你「地址 + key + 模型名」的三件套都能用',
    needsKey: true,
    keyUrl: '',
    keySteps: '向服务提供方要 Base URL、API key、模型名三项，缺一不可',
    keyExample: 'sk-1a2b3c4d5e6f7a8b…',
    modelExample: 'gpt-4o-mini',
    baseUrlExample: 'https://your-gateway.example.com/v1',
  },
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
  PROVIDER_GUIDE,
  normalizeProvider,
  presetByProfileName,
  exportPresetCatalog,
};
