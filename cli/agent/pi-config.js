'use strict';

/**
 * The model configuration the Terminal Agent runs on.
 *
 * There is exactly one source: Pi's own agent directory, the same one Pi Web
 * reads and writes from its model page. This module only reads it. It never
 * writes models.json, never copies keys, and never prints one.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function expandHome(value, homeDir) {
  const text = String(value || '').trim();
  if (text === '~') return homeDir;
  if (text.startsWith('~/')) return path.join(homeDir, text.slice(2));
  return text;
}

/** Same rule as Pi's getAgentDir(): PI_CODING_AGENT_DIR, else ~/.pi/agent. */
function agentDir({ env = process.env, homeDir = os.homedir() } = {}) {
  const fromEnv = String(env.PI_CODING_AGENT_DIR || '').trim();
  if (fromEnv) return path.resolve(expandHome(fromEnv, homeDir));
  return path.join(homeDir, '.pi', 'agent');
}

function readJson(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resolve a Pi config value the way models.json writes it: literal text,
 * `$NAME` or `${NAME}` for an environment variable. A `!command` value is left
 * unresolved on purpose, since running it is Pi's job and not ours.
 */
function resolveKeyValue(value, env = process.env) {
  if (typeof value !== 'string' || !value.trim()) return { value: '', kind: 'none' };
  const text = value.trim();
  if (text.startsWith('!')) return { value: '', kind: 'command' };
  const ref = text.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/) || text.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (ref) {
    const found = env[ref[1]];
    return found ? { value: found, kind: 'env' } : { value: '', kind: 'missing-env', name: ref[1] };
  }
  return { value: text, kind: 'literal' };
}

function maskSecret(secret) {
  const text = String(secret || '');
  if (!text) return '(未设置)';
  if (text.length <= 8) return '****';
  return `${text.slice(0, 3)}…${text.slice(-4)}`;
}

/**
 * Read the default model Pi would start on, plus what is needed to call it
 * over HTTP when a tool talks to the model directly.
 */
function readPiModel({ env = process.env, homeDir = os.homedir() } = {}) {
  const dir = agentDir({ env, homeDir });
  const settingsFile = path.join(dir, 'settings.json');
  const modelsFile = path.join(dir, 'models.json');
  const settings = readJson(settingsFile);
  const models = readJson(modelsFile);
  const providers = models.providers && typeof models.providers === 'object' ? models.providers : {};

  const provider = String(settings.defaultProvider || '').trim();
  const model = String(settings.defaultModel || '').trim();
  const entry = provider ? providers[provider] : null;
  const key = resolveKeyValue(entry && entry.apiKey, env);

  const baseUrl = entry && typeof entry.baseUrl === 'string' ? entry.baseUrl.trim() : '';
  const api = entry && typeof entry.api === 'string' ? entry.api : '';
  const compatible = !api || api === 'openai-completions';

  let direct = null;
  if (provider && model && baseUrl && key.value && compatible) {
    direct = { provider, model, baseUrl, apiKey: key.value };
  }

  return {
    dir,
    settingsFile,
    modelsFile,
    provider,
    model,
    configured: Boolean(provider && model),
    providerCount: Object.keys(providers).length,
    keyState: key.kind,
    keyMask: key.kind === 'literal' || key.kind === 'env' ? maskSecret(key.value) : '',
    direct,
  };
}

/** One line for the start-up banner. Never contains the key. */
function describeModel(info) {
  if (!info.configured) return 'No default model';
  const mask = info.keyMask ? ` · ${info.keyMask}` : '';
  return `${info.provider} · ${info.model}${mask}`;
}

module.exports = { agentDir, readPiModel, resolveKeyValue, describeModel, maskSecret };
