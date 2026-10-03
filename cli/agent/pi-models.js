'use strict';

const crypto = require('crypto');

/**
 * Bridge between OpenTest profiles and Pi's model registry.
 *
 * Pi owns model selection at runtime: it has a built-in `/model` picker,
 * `Ctrl+P` / `Shift+Ctrl+P` cycling, and an extension API (`ctx.setModel`)
 * that swaps the model of a live session without dropping conversation
 * context. None of that needs reimplementing — but Pi can only switch
 * between models it knows about.
 *
 * Previously we wrote only the *active* profile into `models.json`, so Pi
 * had exactly one model to choose from. That is the real reason switching
 * appeared to require a restart: there was nothing to switch *to*.
 *
 * So instead of shipping our own selector, we register every stored profile
 * as a Pi provider with its own model, then hand Pi the `--models` scope so
 * the built-in UI and keybindings do the rest.
 */

const PROVIDER_PREFIX = 'opentest';
const ENV_PREFIX = 'OPENTEST_KEY_';
const OLLAMA_API_KEY = 'ollama';

/** Readable, Unicode-aware slug: `Free OpenRouter!` -> `free-openrouter`. */
function slugify(value) {
  const slug = String(value == null ? '' : value)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'default';
}

/** ASCII-only slug, so it is safe to build an env var name from. */
function asciiSlug(value) {
  return String(value == null ? '' : value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 6);
}

/**
 * The id fragment for a profile, as a pure function of its name.
 *
 * It has to be pure: `launch.js` derives the startup provider from one name,
 * `extension.js` looks a profile up in the registry by name, and
 * `models.json` registers every profile — but those three sites do not all hold
 * the full profile list. So uniqueness cannot come from list order; it has to
 * come from the name itself.
 *
 * Naively stripping to ASCII was silently destructive: `免费额度` and `付费额度`
 * both slugified to `default`, and because `providers` is a keyed object the
 * second one quietly overwrote the first — the user configured two models and
 * got one, with no error anywhere. So when a name contains anything that the
 * ASCII slug throws away, we mix in a hash of the original to keep ids distinct.
 *
 * Names already made of `[a-z0-9-]` slug to themselves and stay readable.
 */
function idFragment(profileName) {
  const raw = String(profileName == null ? '' : profileName).trim();
  const lower = raw.toLowerCase();
  const ascii = asciiSlug(raw);
  if (/^[a-z0-9][a-z0-9-]*$/.test(lower) && ascii) return ascii;
  return ascii ? `${ascii}-${shortHash(raw)}` : shortHash(raw);
}

/**
 * Pi provider id for a profile. Derived from the profile name rather than the
 * host so two profiles on the same host (different keys, or a free tier next
 * to a paid one) stay distinct and independently switchable.
 */
function piProviderId(profileName) {
  return `${PROVIDER_PREFIX}-${idFragment(profileName)}`;
}

/** Env var holding one profile's key. Pi reads `$NAME` references from models.json. */
function piEnvName(profileName) {
  return `${ENV_PREFIX}${idFragment(profileName).replace(/-/g, '_').toUpperCase()}`;
}

/** `provider/id` reference — the form Pi uses for `--model` and `--models`. */
function piModelRef(profile) {
  return `${piProviderId(profile.name)}/${profile.model}`;
}

function normalizeProfile(profile) {
  return {
    name: String(profile.name || '').trim(),
    provider: String(profile.provider || '').trim(),
    baseUrl: String(profile.baseUrl || '').trim(),
    model: String(profile.model || '').trim(),
    apiKey: profile.apiKey,
  };
}

/**
 * Keep only profiles that can actually be switched to: Pi needs a model id to
 * show them, and cycling onto a profile with no usable key would fail on use.
 */
function selectableProfiles(profiles, { requireUsable = true } = {}) {
  return (profiles || [])
    .filter((profile) => profile && profile.model)
    .filter((profile) => (requireUsable ? profile.usable !== false : true))
    .map(normalizeProfile);
}

/**
 * Build `models.json`: one Pi provider per OpenTest profile.
 *
 * Keys are written as `$ENV_NAME` references, never inline — models.json is a
 * readable file on disk and must not become a place secrets are persisted.
 */
function buildModelsDocument(profiles) {
  const providers = {};
  for (const profile of selectableProfiles(profiles)) {
    providers[piProviderId(profile.name)] = {
      baseUrl: profile.baseUrl,
      api: 'openai-completions',
      apiKey: profile.provider === 'ollama' ? OLLAMA_API_KEY : `$${piEnvName(profile.name)}`,
      models: [{ id: profile.model, name: `${profile.name} · ${profile.model}` }],
    };
  }
  return { providers };
}

/** Env vars for every profile's key, so each `$ENV_NAME` reference resolves. */
function buildProfileEnv(profiles) {
  const env = {};
  for (const profile of selectableProfiles(profiles)) {
    if (profile.provider === 'ollama') continue;
    if (!profile.apiKey) continue;
    env[piEnvName(profile.name)] = profile.apiKey;
  }
  return env;
}

/**
 * The `--models` scope: what Pi offers in its model picker and what `Ctrl+P`
 * cycles through. Empty string when there is nothing to cycle.
 */
function buildModelsScope(profiles) {
  return selectableProfiles(profiles)
    .map((profile) => piModelRef(profile))
    .join(',');
}

module.exports = {
  PROVIDER_PREFIX,
  ENV_PREFIX,
  OLLAMA_API_KEY,
  slugify,
  asciiSlug,
  idFragment,
  piProviderId,
  piEnvName,
  piModelRef,
  normalizeProfile,
  selectableProfiles,
  buildModelsDocument,
  buildProfileEnv,
  buildModelsScope,
};
