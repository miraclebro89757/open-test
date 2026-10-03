'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_FAILOVER,
  PRESETS,
  normalizeProvider,
  presetByProfileName,
} = require('./presets');

const OPENAI_FALLBACK = {
  provider: 'custom',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  maxTokens: 4096,
  timeoutMs: 30000,
  description: 'Legacy OPENAI_* environment fallback',
};

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function isPlaceholderKey(key) {
  if (isBlank(key)) return true;
  const text = String(key).trim();
  if (text === 'ollama-no-key-required') return false;
  if (/x{4,}/i.test(text)) return true;
  if (text.includes('xxxxxxxxxxxx')) return true;
  if (/^(sk-)?(your|demo|placeholder|changeme|example|test-testing-free)/i.test(text)) return true;
  return false;
}

function maskKey(key) {
  if (isBlank(key)) return '(empty)';
  const text = String(key);
  if (text === 'ollama-no-key-required') return text;
  if (text.length <= 8) return '***';
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

/**
 * Clean up what a user actually pastes. People copy keys out of a web page, a
 * curl command, or a JSON file, so the raw value often carries a `Bearer `
 * prefix, surrounding quotes, or stray whitespace. Storing that verbatim
 * produces an auth failure that is painful to diagnose, so normalize here.
 */
function sanitizeApiKey(raw) {
  let text = String(raw === undefined || raw === null ? '' : raw).trim();
  if (!text) return '';
  text = text.replace(/^Bearer\s+/i, '');
  // Strip one layer of matching quotes, e.g. "sk-xxx" or 'sk-xxx'.
  const quoted = text.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) text = quoted[2].trim();
  return text;
}

/**
 * Validate a pasted key before it is written to disk.
 * @returns {true|string} true when acceptable, otherwise a message shown
 *   directly under the input box.
 */
function validateApiKeyInput(raw) {
  const key = sanitizeApiKey(raw);
  if (!key) {
    return '请填写 API key（不想填 key 就选「Ollama 本地模型」）';
  }
  if (/[<>"'{}[\]]/.test(key)) {
    return 'key 里不该有引号或括号，你可能粘贴了整段 JSON 或 curl 命令';
  }
  if (/[\s]/.test(key)) {
    return 'key 里出现了空格，多半是复制多了，只保留中间那一串字符';
  }
  if (isPlaceholderKey(key)) {
    return '这看起来是文档里的示例占位符，请填自己账号里真实的 key';
  }
  if (key.length < 20) {
    return `只有 ${key.length} 位，真实 key 通常 30 位以上，请确认复制完整`;
  }
  return true;
}

function expandEnvRef(value, env) {
  if (typeof value !== 'string') return value;
  const braced = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  const prefixed = value.match(/^env:([A-Za-z_][A-Za-z0-9_]*)$/);
  const name = (braced || prefixed)?.[1];
  if (!name) return value;
  return env[name] || '';
}

function resolvePaths({ cwd, homeDir, env = process.env } = {}) {
  const root = cwd || env.OPENTEST_CWD || process.cwd();
  const home = homeDir || env.OPENTEST_HOME || os.homedir();
  return {
    cwd: root,
    homeDir: home,
    project: env.OPENTEST_CONFIG || path.join(root, 'opentest.config.json'),
    user: path.join(home, '.opentest', 'config.json'),
  };
}

function readDocument(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { doc: null, exists: false, path: filePath };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    const error = new Error(`Cannot read LLM config ${filePath}: ${err.message}`);
    error.code = 'INVALID_CONFIG';
    throw error;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const error = new Error(`LLM config ${filePath} must be a JSON object`);
    error.code = 'INVALID_CONFIG';
    throw error;
  }
  return { doc: parsed, exists: true, path: filePath };
}

function inferProvider(baseUrl) {
  const url = String(baseUrl || '').toLowerCase();
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('api.deepseek.com')) return 'deepseek';
  if (url.includes('ccswitch')) return 'cc-switch';
  if (url.includes('11434')) return 'ollama';
  return '';
}

function envProfile(env) {
  const apiKey = env.OPENTEST_API_KEY || env.OPENAI_API_KEY || '';
  const baseUrl = env.OPENTEST_BASE_URL || env.OPENAI_BASE_URL || '';
  const model = env.OPENTEST_MODEL || env.OPENAI_MODEL || '';
  const providerRaw = env.OPENTEST_PROVIDER || '';
  if (isBlank(apiKey) && isBlank(baseUrl) && isBlank(model) && isBlank(providerRaw)) {
    return null;
  }
  const profile = { description: 'Environment variables' };
  if (!isBlank(apiKey)) profile.apiKey = apiKey;
  if (!isBlank(baseUrl)) profile.baseUrl = baseUrl;
  if (!isBlank(model)) profile.model = model;
  if (!isBlank(providerRaw)) {
    profile.provider = normalizeProvider(providerRaw);
  } else if (!isBlank(baseUrl)) {
    const inferred = inferProvider(baseUrl);
    if (inferred) profile.provider = inferred;
  }
  return profile;
}

function numeric(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function collectProfile(name, { projectDoc, userDoc, env, overrides, isActive }) {
  const layers = [];
  if (isActive && overrides) layers.push(overrides);
  if (projectDoc?.profiles?.[name]) layers.push(projectDoc.profiles[name]);
  if (userDoc?.profiles?.[name]) layers.push(userDoc.profiles[name]);
  const fromEnv = envProfile(env);
  if (isActive && fromEnv) layers.push(fromEnv);

  const providerHint = layers.map((layer) => layer.provider).find((value) => !isBlank(value));
  const namedPreset = presetByProfileName(name);
  const preset = (providerHint && PRESETS[normalizeProviderSafe(providerHint)]) || namedPreset;
  if (preset) layers.push(preset);
  if (isActive && !preset) layers.push(OPENAI_FALLBACK);

  const provider = firstString(layers, 'provider', env) || preset?.provider || 'custom';
  const baseUrl = firstString(layers, 'baseUrl', env) || preset?.baseUrl || '';
  const model = firstString(layers, 'model', env) || preset?.model || '';
  const apiKey = firstUsableKey(layers, env);
  const description = firstString(layers, 'description', env) || preset?.description || '';

  return {
    provider: normalizeProviderSafe(provider) || provider,
    baseUrl,
    apiKey,
    model,
    temperature: firstNumber(layers, 'temperature', preset?.temperature ?? 0.2),
    maxTokens: firstNumber(layers, 'maxTokens', preset?.maxTokens ?? 4096),
    timeoutMs: firstNumber(layers, 'timeoutMs', preset?.timeoutMs ?? 30000),
    description,
  };
}

function normalizeProviderSafe(value) {
  if (isBlank(value)) return '';
  try {
    return normalizeProvider(value);
  } catch {
    return String(value);
  }
}

function firstString(layers, field, env) {
  for (const layer of layers) {
    if (!layer || isBlank(layer[field])) continue;
    const expanded = expandEnvRef(layer[field], env);
    if (!isBlank(expanded)) return expanded;
  }
  return '';
}

function firstNumber(layers, field, fallback) {
  for (const layer of layers) {
    if (!layer || layer[field] === undefined || layer[field] === null || layer[field] === '') continue;
    return numeric(layer[field], fallback);
  }
  return fallback;
}

function firstUsableKey(layers, env) {
  let placeholder = '';
  for (const layer of layers) {
    if (!layer || isBlank(layer.apiKey)) continue;
    const expanded = expandEnvRef(String(layer.apiKey), env);
    if (isBlank(expanded)) continue;
    if (isPlaceholderKey(expanded)) {
      if (!placeholder) placeholder = expanded;
      continue;
    }
    return expanded;
  }
  return placeholder;
}

function profileNames(projectDoc, userDoc, activeProfile, failoverOrder) {
  const names = new Set();
  Object.keys(projectDoc?.profiles || {}).forEach((name) => names.add(name));
  Object.keys(userDoc?.profiles || {}).forEach((name) => names.add(name));
  if (activeProfile) names.add(activeProfile);
  (failoverOrder || []).forEach((name) => names.add(name));
  return [...names];
}

function chooseActiveProfile({ projectDoc, userDoc, env, overrides }) {
  if (overrides && !isBlank(overrides.profile)) {
    return { name: overrides.profile, source: 'cli' };
  }
  if (projectDoc && !isBlank(projectDoc.active_profile)) {
    return { name: projectDoc.active_profile, source: 'project' };
  }
  if (userDoc && !isBlank(userDoc.active_profile)) {
    return { name: userDoc.active_profile, source: 'user' };
  }
  if (!isBlank(env.OPENTEST_PROFILE)) {
    return { name: env.OPENTEST_PROFILE, source: 'env' };
  }
  if (envProfile(env)) {
    return { name: 'env', source: 'env' };
  }
  return { name: 'free-openrouter', source: 'preset' };
}

function isUsableConfig(config) {
  if (!config || isBlank(config.baseUrl) || isBlank(config.model)) return false;
  if (config.provider === 'ollama') return true;
  return !isPlaceholderKey(config.apiKey);
}

function resolveLLMConfig({
  cwd,
  homeDir,
  env = process.env,
  overrides = null,
  projectDoc = undefined,
  userDoc = undefined,
} = {}) {
  const paths = resolvePaths({ cwd, homeDir, env });
  const project = projectDoc === undefined ? readDocument(paths.project) : { doc: projectDoc, exists: !!projectDoc, path: paths.project };
  const user = userDoc === undefined ? readDocument(paths.user) : { doc: userDoc, exists: !!userDoc, path: paths.user };
  const active = chooseActiveProfile({
    projectDoc: project.doc,
    userDoc: user.doc,
    env,
    overrides,
  });
  const failoverOrder = firstFailover(overrides, project.doc, user.doc);

  const names = profileNames(project.doc, user.doc, active.name, failoverOrder);
  const resolvedProfiles = {};
  names.forEach((name) => {
    resolvedProfiles[name] = collectProfile(name, {
      projectDoc: project.doc,
      userDoc: user.doc,
      env,
      overrides,
      isActive: name === active.name,
    });
  });

  const chainNames = [];
  const pushName = (name) => {
    if (!name || chainNames.includes(name) || !resolvedProfiles[name]) return;
    chainNames.push(name);
  };
  pushName(active.name);
  failoverOrder.forEach(pushName);

  const chain = chainNames.map((name) => ({
    name,
    config: resolvedProfiles[name],
  }));

  // Failover names that no config file actually contains are still listed (the
  // chain is useful to see), but they are not switchable. Flag them so callers
  // that write or activate profiles only ever touch real ones.
  const storedNames = new Set([
    ...Object.keys(project.doc?.profiles || {}),
    ...Object.keys(user.doc?.profiles || {}),
  ]);
  if (active.source === 'env' || active.source === 'cli') storedNames.add(active.name);

  const profiles = names.map((name) => ({
    name,
    provider: resolvedProfiles[name].provider,
    model: resolvedProfiles[name].model,
    baseUrl: resolvedProfiles[name].baseUrl,
    maskedKey: maskKey(resolvedProfiles[name].apiKey),
    usable: isUsableConfig(resolvedProfiles[name]),
    saved: storedNames.has(name),
  }));

  return {
    activeProfile: active.name,
    profileSource: active.source,
    config: resolvedProfiles[active.name],
    chain,
    failoverOrder,
    profiles,
    taskModels: readTaskModels({ ...resolvePaths({ cwd, homeDir, env }), projectDoc: project.doc, userDoc: user.doc }),
    projectPath: paths.project,
    userPath: paths.user,
    projectExists: project.exists,
    userExists: user.exists,
  };
}

function firstFailover(overrides, projectDoc, userDoc) {
  if (overrides && Array.isArray(overrides.failoverOrder) && overrides.failoverOrder.length) {
    return overrides.failoverOrder;
  }
  if (Array.isArray(projectDoc?.failover_order) && projectDoc.failover_order.length) {
    return projectDoc.failover_order;
  }
  if (Array.isArray(userDoc?.failover_order) && userDoc.failover_order.length) {
    return userDoc.failover_order;
  }
  return DEFAULT_FAILOVER.slice();
}

function defaultScope(cwd) {
  const root = cwd || process.cwd();
  if (fs.existsSync(path.join(root, 'opentest.config.json'))) return 'project';
  if (fs.existsSync(path.join(root, 'package.json')) || fs.existsSync(path.join(root, '.git'))) {
    return 'project';
  }
  return 'user';
}

function writeProfile({
  cwd,
  homeDir,
  env = process.env,
  scope,
  profileName,
  profile,
  activate = true,
}) {
  if (isBlank(profileName)) {
    throw new Error('Profile name is required');
  }
  const paths = resolvePaths({ cwd, homeDir, env });
  const targetScope = scope || defaultScope(paths.cwd);
  const filePath = targetScope === 'user' ? paths.user : paths.project;
  const current = readDocument(filePath);
  const existing = current.doc || {};
  const profiles = { ...(existing.profiles || {}) };
  const previous = { ...(profiles[profileName] || {}) };
  Object.entries(profile || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    previous[key] = value;
  });
  profiles[profileName] = previous;
  const next = {
    ...existing,
    profiles,
    active_profile: activate ? profileName : existing.active_profile || profileName,
    failover_order:
      Array.isArray(existing.failover_order) && existing.failover_order.length
        ? existing.failover_order
        : DEFAULT_FAILOVER.slice(),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return {
    filePath,
    scope: targetScope,
    document: next,
    warning: projectKeyWarning(targetScope, paths.cwd, profile?.apiKey),
  };
}

function projectKeyWarning(scope, cwd, apiKey) {
  if (scope !== 'project' || isBlank(apiKey) || isPlaceholderKey(apiKey)) return '';
  const gitignore = path.join(cwd, '.gitignore');
  let ignored = false;
  if (fs.existsSync(gitignore)) {
    ignored = fs
      .readFileSync(gitignore, 'utf8')
      .split('\n')
      .some((line) => {
        const trimmed = line.trim();
        return trimmed === 'opentest.config.json' || trimmed === '/opentest.config.json';
      });
  }
  if (ignored) return '';
  return 'API key was written to opentest.config.json. Add that file to .gitignore, or use --global to keep the key in ~/.opentest/config.json.';
}

function useProfile({ cwd, homeDir, env = process.env, scope, profileName }) {
  const paths = resolvePaths({ cwd, homeDir, env });
  const project = readDocument(paths.project);
  const user = readDocument(paths.user);
  const known = new Set([
    ...Object.keys(project.doc?.profiles || {}),
    ...Object.keys(user.doc?.profiles || {}),
  ]);
  if (!known.has(profileName)) {
    const error = new Error(
      `Unknown profile "${profileName}". Known profiles: ${[...known].join(', ') || '(none)'}`
    );
    error.code = 'UNKNOWN_PROFILE';
    throw error;
  }

  let targetScope = scope;
  if (!targetScope) {
    if (project.exists && (project.doc.active_profile || project.doc.profiles)) targetScope = 'project';
    else if (user.exists) targetScope = 'user';
    else targetScope = 'project';
  }

  const filePath = targetScope === 'user' ? paths.user : paths.project;
  const current = readDocument(filePath);
  const existing = current.doc ? { ...current.doc } : {};
  if (!existing.profiles) existing.profiles = {};
  if (!existing.profiles[profileName]) {
    const source = project.doc?.profiles?.[profileName] || user.doc?.profiles?.[profileName];
    existing.profiles[profileName] = { ...source };
  }
  existing.active_profile = profileName;
  if (!Array.isArray(existing.failover_order) || !existing.failover_order.length) {
    existing.failover_order = DEFAULT_FAILOVER.slice();
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(existing, null, 2)}\n`, { mode: 0o600 });

  let warning = '';
  if (targetScope === 'user' && project.exists && project.doc?.active_profile) {
    warning = `Project config ${paths.project} still sets active_profile and overrides the user config. Update the project file, or pass --project.`;
  }
  return { filePath, scope: targetScope, activeProfile: profileName, warning };
}

function formatConfigList(resolved) {
  const lines = [
    `Active profile: ${resolved.activeProfile} (${resolved.profileSource})`,
    `Provider: ${resolved.config.provider}`,
    `Model: ${resolved.config.model || '(empty)'}`,
    `Base URL: ${resolved.config.baseUrl || '(empty)'}`,
    `API key: ${maskKey(resolved.config.apiKey)}`,
    `Project file: ${resolved.projectPath}${resolved.projectExists ? '' : ' (missing)'}`,
    `User file: ${resolved.userPath}${resolved.userExists ? '' : ' (missing)'}`,
    `Failover: ${resolved.chain.map((item) => item.name).join(' -> ') || '(none)'}`,
    '',
  ];
  if (!resolved.profiles.length) {
    lines.push('No saved profiles.');
  }
  resolved.profiles.forEach((item) => {
    const mark = item.name === resolved.activeProfile ? '*' : ' ';
    const usable = item.usable ? '' : '  (not usable)';
    lines.push(`${mark} ${item.name}  ${item.provider}  ${item.model || '(no model)'}  ${item.maskedKey}${usable}`);
  });
  return lines.join('\n');
}

/**
 * Read one stored profile in full, including its real API key.
 *
 * Callers must never print the returned key — use `formatProfileChoice` to show
 * a profile to a human. Reading it locally is what lets "replace" reuse a key
 * the user already stored instead of making them paste it again.
 */
function readProfile({ cwd, homeDir, env = process.env, profileName }) {
  const paths = resolvePaths({ cwd, homeDir, env });
  for (const filePath of [paths.project, paths.user]) {
    const doc = readDocument(filePath).doc;
    const found = doc && doc.profiles && doc.profiles[profileName];
    if (found) return { ...found, name: profileName, filePath };
  }
  return null;
}

/**
 * One-line, masked label for an interactive profile picker. The raw key is
 * never part of this string, so it is safe to render in a TUI or send to a model.
 */
function formatProfileChoice(item, isActive = false) {
  const mark = isActive ? '✅' : '  ';
  const unusable = item.usable ? '' : '  (key 不可用)';
  return `${mark} ${item.name} · ${item.provider} · ${item.model || '(无模型)'} · ${item.maskedKey}${unusable}`;
}

/**
 * Testing tasks that can be routed to a different model.
 *
 * Reasoning-heavy work (requirement analysis, bug analysis) wants a strong
 * model; bulk structured output (case generation, reports) does not. Keeping
 * the mapping here — rather than hardcoding it in the agent — means the user
 * can retune it without touching code.
 */
const TASK_MODELS = [
  { id: 'requirementAnalysis', label: '需求分析', steps: ['analyze'] },
  { id: 'testCaseGeneration', label: '用例生成', steps: ['points', 'cases'] },
  { id: 'codeGeneration', label: '自动化代码', steps: ['record', 'heal'] },
  { id: 'bugAnalysis', label: '缺陷分析', steps: ['defects'] },
  { id: 'reportGeneration', label: '测试报告', steps: ['report'] },
];

const TASK_MODEL_IDS = TASK_MODELS.map((task) => task.id);

/**
 * Natural things people actually type for a task. Matching only the exact id or
 * label made `config routing 报告生成` fail on a label of `测试报告`, which is
 * the kind of near-miss that should just work.
 */
const TASK_ALIASES = {
  requirementAnalysis: ['requirement', 'requirements', '需求', '需求分析', '分析'],
  testCaseGeneration: ['testcase', 'testcases', 'case', 'cases', 'point', 'points', '用例', '用例生成', '测试点', '测试点生成'],
  codeGeneration: ['code', 'codegen', '代码', '代码生成', '录制', '自愈', '自动化'],
  bugAnalysis: ['bug', 'bugs', 'defect', 'defects', 'issue', '缺陷', '缺陷分析'],
  reportGeneration: ['report', 'summary', '报告', '报告生成', '测试报告', '简报'],
};

/** Which task a step command belongs to, if any. */
function taskForStep(step) {
  return TASK_MODELS.find((task) => task.steps.includes(String(step || ''))) || null;
}

function normalizeTaskId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase().replace(/[\s_-]+/g, '');
  const exact = TASK_MODELS.find(
    (task) => task.id.toLowerCase() === lower || task.label === raw
  );
  if (exact) return exact.id;
  return TASK_MODELS.find((task) =>
    (TASK_ALIASES[task.id] || []).some((alias) => alias.replace(/[\s_-]+/g, '') === lower)
  )?.id || '';
}

/** Merged task -> profile mapping; project config wins over user config. */
function readTaskModels({ cwd, homeDir, env = process.env, projectDoc, userDoc } = {}) {
  const paths = resolvePaths({ cwd, homeDir, env });
  const project = projectDoc === undefined ? readDocument(paths.project).doc : projectDoc;
  const user = userDoc === undefined ? readDocument(paths.user).doc : userDoc;
  const merged = { ...(user?.task_models || {}), ...(project?.task_models || {}) };
  const clean = {};
  for (const task of TASK_MODEL_IDS) {
    const value = merged[task];
    if (typeof value === 'string' && value.trim()) clean[task] = value.trim();
  }
  return clean;
}

/**
 * Persist one task -> profile mapping. Pass an empty `profileName` to clear it
 * and fall back to whatever model the session is already using.
 */
function writeTaskModel({ cwd, homeDir, env = process.env, scope, task, profileName }) {
  const taskId = normalizeTaskId(task);
  if (!taskId) {
    throw new Error(`Unknown task "${task}". Known tasks: ${TASK_MODEL_IDS.join(', ')}`);
  }
  const paths = resolvePaths({ cwd, homeDir, env });
  const targetScope = scope || defaultScope(paths.cwd);
  const filePath = targetScope === 'user' ? paths.user : paths.project;
  const existing = readDocument(filePath).doc || {};
  const taskModels = { ...(existing.task_models || {}) };
  const value = String(profileName || '').trim();
  if (value) taskModels[taskId] = value;
  else delete taskModels[taskId];
  const next = { ...existing, task_models: taskModels };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return { filePath, scope: targetScope, task: taskId, profileName: value || null };
}

function buildScaffoldDocument() {
  return require('./presets').exportPresetCatalog();
}

module.exports = {
  OPENAI_FALLBACK,
  TASK_MODELS,
  TASK_MODEL_IDS,
  isBlank,
  isPlaceholderKey,
  isUsableConfig,
  maskKey,
  sanitizeApiKey,
  validateApiKeyInput,
  normalizeTaskId,
  taskForStep,
  readTaskModels,
  writeTaskModel,
  resolvePaths,
  resolveLLMConfig,
  writeProfile,
  useProfile,
  formatConfigList,
  formatProfileChoice,
  readProfile,
  buildScaffoldDocument,
  defaultScope,
};
