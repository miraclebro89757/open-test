'use strict';

const assert = require('assert');
const test = require('node:test');
const { completeWithFailover, ping } = require('./adapter');

function jsonResponse(status, payload) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

function scriptedFetch(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      body: JSON.parse(init.body),
      auth: init.headers.Authorization || '',
      headers: init.headers,
    });
    const step = script[calls.length - 1];
    if (!step) throw new Error(`unexpected call ${calls.length}`);
    if (step.throw) {
      const error = new Error(step.throw);
      if (step.name) error.name = step.name;
      throw error;
    }
    return jsonResponse(step.status, step.body);
  };
  return { fetchImpl, calls };
}

const deepseek = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-project-deepseek-key-1234',
  model: 'deepseek-chat',
  temperature: 0.1,
  maxTokens: 32,
  timeoutMs: 1000,
};

const openrouter = {
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or-v1-real-key-abcdef',
  model: 'deepseek/deepseek-r1:free',
  temperature: 0.2,
  maxTokens: 32,
  timeoutMs: 1000,
};

const chain = [
  { name: 'deepseek-prod', config: deepseek },
  { name: 'free-openrouter', config: openrouter },
];

test('429 is retried twice on the same provider before failover', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { status: 429, body: 'rate limit' },
    { status: 429, body: 'rate limit' },
    { status: 429, body: 'rate limit' },
    { status: 200, body: { choices: [{ message: { content: 'pong' } }] } },
  ]);
  const events = [];
  const result = await completeWithFailover(chain, 'ping', {
    fetchImpl,
    sleep: async () => {},
    retryDelayMs: 0,
    onFailover: (event) => events.push(event),
  });

  assert.equal(result.profile, 'free-openrouter');
  assert.equal(result.content, 'pong');
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((call) => call.url.includes('deepseek')).length, 3);
  assert.equal(events[0].from, 'deepseek-prod');
  assert.equal(events[0].to, 'free-openrouter');
  assert.equal(calls[3].auth, 'Bearer sk-or-v1-real-key-abcdef');
  assert.equal(calls[3].body.messages.at(-1).content, 'ping');
});

test('a successful retry does not leave the provider', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { status: 503, body: 'unavailable' },
    { status: 200, body: { choices: [{ message: { content: 'ok' } }] } },
  ]);
  const result = await completeWithFailover(chain, 'hello', {
    fetchImpl,
    sleep: async () => {},
  });
  assert.equal(result.profile, 'deepseek-prod');
  assert.equal(calls.length, 2);
});

test('authentication failure skips to the next profile without retrying', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { status: 401, body: 'invalid api key' },
    { status: 200, body: { choices: [{ message: { content: 'backup' } }] } },
  ]);
  const result = await completeWithFailover(chain, 'hello', {
    fetchImpl,
    sleep: async () => {},
  });
  assert.equal(result.content, 'backup');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.deepseek.com/v1/chat/completions');
});

test('openrouter requests include attribution headers', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { status: 200, body: { choices: [{ message: { content: 'pong' } }] } },
  ]);
  await ping(openrouter, { fetchImpl, timeoutMs: 1000 });
  assert.equal(calls[0].body.max_tokens, 16);
  assert.equal(calls[0].body.temperature, 0);
  assert.equal(calls[0].headers['HTTP-Referer'], 'https://github.com/miraclebro89757/open-test');
  assert.equal(calls[0].headers['X-Title'], 'OpenTest QA Agent');
});

test('ping reports the provider error instead of a fake success', async () => {
  const { fetchImpl } = scriptedFetch([{ status: 401, body: 'bad key' }]);
  const result = await ping(deepseek, { fetchImpl, timeoutMs: 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.match(result.message, /HTTP 401/);
});

test('placeholder keys are not sent', async () => {
  let called = false;
  const result = await ping(
    { ...openrouter, apiKey: 'sk-or-v1-xxxxxxxxxxxx' },
    {
      fetchImpl: async () => {
        called = true;
        return jsonResponse(200, {});
      },
    }
  );
  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.match(result.message, /placeholder|usable/i);
});

test('timeouts are retried and then fail over', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { throw: 'aborted', name: 'AbortError' },
    { throw: 'aborted', name: 'AbortError' },
    { throw: 'aborted', name: 'AbortError' },
    { status: 200, body: { choices: [{ message: { content: 'recovered' } }] } },
  ]);
  const result = await completeWithFailover(chain, 'ping', {
    fetchImpl,
    sleep: async () => {},
  });
  assert.equal(result.content, 'recovered');
  assert.equal(calls.length, 4);
});
