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

  const profiles = names.map((name) => ({
    name,
    provider: resolvedProfiles[name].provider,
    model: resolvedProfiles[name].model,
    baseUrl: resolvedProfiles[name].baseUrl,
    maskedKey: maskKey(resolvedProfiles[name].apiKey),
    usable: isUsableConfig(resolvedProfiles[name]),
  }));

  return {
    activeProfile: active.name,
    profileSource: active.source,
    config: resolvedProfiles[active.name],
    chain,
    failoverOrder,
    profiles,
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

function buildScaffoldDocument() {
  return require('./presets').exportPresetCatalog();
}

module.exports = {
  OPENAI_FALLBACK,
  isBlank,
  isPlaceholderKey,
  isUsableConfig,
  maskKey,
  resolvePaths,
  resolveLLMConfig,
  writeProfile,
  useProfile,
  formatConfigList,
  buildScaffoldDocument,
  defaultScope,
};
