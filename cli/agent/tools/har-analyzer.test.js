'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const {
  analyzeHAR,
  extractBasicInfo,
  performAIAnalysis,
  fallbackAnalysis,
  normalizeAIResult,
  SENSITIVE_PATTERNS,
  DYNAMIC_PATTERNS,
} = require('./har-analyzer');

function sampleHAR() {
  return {
    log: {
      version: '1.2',
      creator: { name: 'OpenTest', version: '1.0' },
      entries: [
        {
          startedDateTime: '2024-01-01T10:00:00.000Z',
          time: 150,
          request: {
            method: 'POST',
            url: 'https://api.example.com/auth/login',
            headers: [{ name: 'Content-Type', value: 'application/json' }],
            postData: {
              mimeType: 'application/json',
              text: JSON.stringify({ username: 'test@example.com', password: 'secret123' }),
            },
          },
          response: {
            status: 200,
            headers: [{ name: 'Content-Type', value: 'application/json' }],
            content: {
              mimeType: 'application/json',
              text: JSON.stringify({
                token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSJ9.signature',
                userId: '12345',
                expiresIn: 3600,
              }),
            },
          },
        },
        {
          startedDateTime: '2024-01-01T10:00:01.000Z',
          time: 80,
          request: {
            method: 'GET',
            url: 'https://api.example.com/users/12345',
            headers: [
              {
                name: 'Authorization',
                value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSJ9.signature',
              },
              { name: 'Accept', value: 'application/json' },
            ],
          },
          response: {
            status: 200,
            headers: [{ name: 'Content-Type', value: 'application/json' }],
            content: {
              mimeType: 'application/json',
              text: JSON.stringify({ id: '12345', name: 'Test User', email: 'test@example.com' }),
            },
          },
        },
        {
          startedDateTime: '2024-01-01T10:00:02.000Z',
          time: 120,
          request: {
            method: 'POST',
            url: 'https://api.example.com/resources',
            headers: [
              {
                name: 'Authorization',
                value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSJ9.signature',
              },
              { name: 'Content-Type', value: 'application/json' },
            ],
            postData: {
              mimeType: 'application/json',
              text: JSON.stringify({ name: 'New Resource', type: 'document' }),
            },
          },
          response: {
            status: 201,
            headers: [{ name: 'Content-Type', value: 'application/json' }],
            content: {
              mimeType: 'application/json',
              text: JSON.stringify({ id: 'abc-def-123', name: 'New Resource', createdAt: 1704103202000 }),
            },
          },
        },
      ],
    },
  };
}

async function withFixture(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'opentest-har-'));
  const harPath = path.join(dir, 'test.har');
  await fs.writeFile(harPath, JSON.stringify(sampleHAR(), null, 2), 'utf-8');
  try {
    return await run(harPath, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function loadEntries(harPath) {
  return JSON.parse(await fs.readFile(harPath, 'utf-8')).log.entries;
}

test('extractBasicInfo extracts endpoints and sensitive fields', async () => {
  await withFixture(async (harPath) => {
    const result = extractBasicInfo(await loadEntries(harPath));

    assert.equal(result.endpoints.length, 3);
    assert.ok(result.endpoints.includes('POST /auth/login'));
    assert.ok(result.endpoints.includes('GET /users/12345'));
    assert.ok(result.endpoints.includes('POST /resources'));

    assert.ok(result.sensitiveFields.length > 0);
    const categories = result.sensitiveFields.map((field) => field.category);
    assert.ok(categories.includes('password'));
    assert.ok(categories.includes('token'));
  });
});

test('fallbackAnalysis works without AI and keeps the contract', async () => {
  await withFixture(async (harPath) => {
    const result = fallbackAnalysis(await loadEntries(harPath));

    assert.ok(Array.isArray(result.variables));
    assert.ok(Array.isArray(result.dependencies));
    assert.ok(Array.isArray(result.requestChains));
    assert.ok(Array.isArray(result.recommendations));

    assert.ok(result.variables.length > 0);
    assert.equal(result.requestChains.length, 1);
    assert.deepEqual(result.requestChains[0].requests, [0, 1, 2]);
  });
});

test('analyzeHAR uses the AI result and reports source ai', async () => {
  await withFixture(async (harPath) => {
    const mockLLM = {
      chat: async () =>
        JSON.stringify({
          variables: [{ name: 'auth_token', location: 'response[0].body.token', type: 'string', usedIn: [1, 2] }],
          dependencies: [
            { from: 0, to: 1, variable: 'auth_token', extraction: 'response.body.token', injection: 'headers.Authorization' },
          ],
          requestChains: [{ name: 'User Authentication Flow', requests: [0, 1, 2], purpose: 'Login and verify' }],
          recommendations: ['Extract auth_token from login response'],
        }),
    };

    const result = await analyzeHAR(harPath, mockLLM);

    assert.equal(result.source, 'ai');
    assert.equal(result.summary.totalRequests, 3);
    assert.equal(result.summary.uniqueEndpoints, 3);
    assert.equal(result.variables.length, 1);
    assert.equal(result.dependencies.length, 1);
  });
});

test('analyzeHAR falls back to rules when the model call throws', async () => {
  await withFixture(async (harPath) => {
    const failingLLM = { chat: async () => { throw new Error('LLM service unavailable'); } };
    const result = await analyzeHAR(harPath, failingLLM);

    assert.equal(result.source, 'rules');
    assert.ok(result.variables.length > 0);
    assert.ok(result.recommendations.some((item) => item.includes('Manual review')));
  });
});

test('analyzeHAR falls back to rules when no client is configured', async () => {
  await withFixture(async (harPath) => {
    for (const client of [null, undefined, {}]) {
      const result = await analyzeHAR(harPath, client);
      assert.equal(result.source, 'rules');
      assert.ok(result.variables.length > 0);
    }
  });
});

test('normalizeAIResult fills missing fields so the renderer cannot crash', () => {
  const normalized = normalizeAIResult({ variables: [{ name: 'token' }] });
  assert.equal(normalized.variables.length, 1);
  assert.deepEqual(normalized.dependencies, []);
  assert.deepEqual(normalized.requestChains, []);
  assert.deepEqual(normalized.recommendations, []);
});

test('performAIAnalysis survives a model returning non-JSON', async () => {
  await withFixture(async (harPath) => {
    const result = await performAIAnalysis(await loadEntries(harPath), { chat: async () => 'not json at all' });
    assert.equal(result.source, 'rules');
    assert.ok(result.variables.length > 0);
  });
});

test('analyzeHAR rejects a HAR without log.entries', async () => {
  await withFixture(async (_harPath, dir) => {
    const invalid = path.join(dir, 'invalid.har');
    await fs.writeFile(invalid, JSON.stringify({ invalid: true }), 'utf-8');
    await assert.rejects(() => analyzeHAR(invalid, { chat: async () => '{}' }), /Invalid HAR format/);
  });
});

test('SENSITIVE_PATTERNS matches credential field names', () => {
  for (const key of ['password', 'apiKey', 'token', 'secret', 'credential']) {
    assert.ok(SENSITIVE_PATTERNS[key], `missing pattern ${key}`);
  }
  assert.ok(SENSITIVE_PATTERNS.password.test('password'));
  assert.ok(SENSITIVE_PATTERNS.password.test('PASSWORD'));
  assert.ok(SENSITIVE_PATTERNS.apiKey.test('api_key'));
  assert.ok(SENSITIVE_PATTERNS.token.test('authorization'));
});

test('DYNAMIC_PATTERNS match uuid, jwt, timestamp and numeric id', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(uuid.match(DYNAMIC_PATTERNS.uuid)[0], uuid);

  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSJ9.signature';
  assert.ok(jwt.match(DYNAMIC_PATTERNS.jwt));

  assert.ok('1704103202000'.match(DYNAMIC_PATTERNS.timestamp));
  assert.ok('123456'.match(DYNAMIC_PATTERNS.numericId));
});