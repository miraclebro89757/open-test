'use strict';

const { isPlaceholderKey, isUsableConfig } = require('./config-store');

const TRANSIENT_STATUSES = new Set([402, 408, 425, 429, 500, 502, 503, 504]);

class ProviderRequestError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProviderRequestError';
    this.status = details.status || 0;
    this.retryable = Boolean(details.retryable);
    this.provider = details.provider || '';
  }
}

function endpointFor(config) {
  return `${String(config.baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
}

function headersFor(config) {
  const headers = { 'Content-Type': 'application/json' };
  const key = config.apiKey || '';
  const sendAuth = config.provider !== 'ollama' || (key && key !== 'ollama-no-key-required');
  if (sendAuth && key) headers.Authorization = `Bearer ${key}`;
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/miraclebro89757/open-test';
    headers['X-Title'] = 'OpenTest QA Agent';
  }
  return headers;
}

function isTransient(status, body) {
  if (TRANSIENT_STATUSES.has(status)) return true;
  return /insufficient[_\s-]?quota|rate limit|too many requests|overloaded|temporarily unavailable/i.test(body || '');
}

async function chatComplete(config, options = {}) {
  if (!isUsableConfig(config)) {
    throw new ProviderRequestError(
      `Profile provider [${config.provider || 'unknown'}] has no usable API key, base URL, or model`,
      { status: 0, retryable: false, provider: config.provider }
    );
  }
  if (config.provider !== 'ollama' && isPlaceholderKey(config.apiKey)) {
    throw new ProviderRequestError('API key is missing or still a placeholder', {
      status: 0,
      retryable: false,
      provider: config.provider,
    });
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new ProviderRequestError('Global fetch is not available', {
      status: 0,
      retryable: false,
      provider: config.provider,
    });
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || config.timeoutMs || 30000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpointFor(config), {
      method: 'POST',
      headers: headersFor(config),
      body: JSON.stringify({
        model: config.model,
        messages: options.messages,
        temperature: options.temperature ?? config.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? config.maxTokens ?? 4096,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ProviderRequestError(
        `LLM provider [${config.provider}] returned HTTP ${response.status}: ${text.slice(0, 300)}`,
        {
          status: response.status,
          retryable: isTransient(response.status, text),
          provider: config.provider,
        }
      );
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new ProviderRequestError(
        `LLM provider [${config.provider}] returned invalid JSON`,
        { status: response.status, retryable: true, provider: config.provider }
      );
    }
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    if (err instanceof ProviderRequestError) throw err;
    const aborted = err?.name === 'AbortError';
    throw new ProviderRequestError(
      aborted
        ? `LLM provider [${config.provider}] timed out after ${timeoutMs}ms`
        : `LLM provider [${config.provider}] request failed: ${err.message}`,
      { status: aborted ? 408 : 0, retryable: true, provider: config.provider }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function completeWithFailover(chain, prompt, options = {}) {
  const messages = [];
  if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
  messages.push({ role: 'user', content: prompt });
  const retries = options.retriesPerProvider ?? 2;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const errors = [];

  for (let index = 0; index < chain.length; index += 1) {
    const entry = chain[index];
    if (!isUsableConfig(entry.config)) {
      errors.push({
        profile: entry.name,
        status: 0,
        message: 'skipped: api key, base URL, or model is not usable',
      });
      continue;
    }

    let attempt = 0;
    while (true) {
      try {
        const content = await chatComplete(entry.config, { ...options, messages });
        return { content, profile: entry.name, provider: entry.config.provider, attempts: attempt + 1 };
      } catch (err) {
        errors.push({
          profile: entry.name,
          status: err.status || 0,
          message: err.message,
          attempt,
        });
        if (err.retryable && attempt < retries) {
          attempt += 1;
          await sleep(options.retryDelayMs ?? 200);
          continue;
        }
        if (typeof options.onFailover === 'function' && index < chain.length - 1) {
          options.onFailover({
            from: entry.name,
            to: chain[index + 1].name,
            status: err.status || 0,
          });
        }
        break;
      }
    }
  }

  const error = new Error(
    `All LLM providers failed. ${errors.map((item) => `${item.profile}: ${item.message}`).join(' | ')}`
  );
  error.errors = errors;
  throw error;
}

async function ping(config, options = {}) {
  const start = Date.now();
  try {
    const content = await chatComplete(config, {
      ...options,
      messages: [
        { role: 'system', content: 'Respond only with pong' },
        { role: 'user', content: 'ping' },
      ],
      temperature: 0,
      maxTokens: 16,
      timeoutMs: options.timeoutMs || Math.min(config.timeoutMs || 20000, 20000),
    });
    return {
      ok: true,
      latencyMs: Date.now() - start,
      status: 200,
      message: `HTTP 200${content ? ` · ${String(content).trim().slice(0, 80)}` : ''}`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      status: err.status || 0,
      message: err.message,
    };
  }
}

module.exports = {
  ProviderRequestError,
  TRANSIENT_STATUSES,
  chatComplete,
  completeWithFailover,
  ping,
  headersFor,
  endpointFor,
};
