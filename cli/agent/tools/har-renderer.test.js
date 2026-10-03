'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const {
  renderHARToPytest,
  generateImports,
  generateConstants,
  generateEnvExample,
  generateTestReadme,
} = require('./har-renderer');

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
              text: JSON.stringify({ username: 'test@example.com', password: 'secret' }),
            },
          },
          response: {
            status: 200,
            headers: [{ name: 'Content-Type', value: 'application/json' }],
            content: {
              mimeType: 'application/json',
              text: JSON.stringify({ token: 'jwt-token-here', userId: '12345' }),
            },
          },
        },
        {
          startedDateTime: '2024-01-01T10:00:01.000Z',
          time: 80,
          request: {
            method: 'GET',
            url: 'https://api.example.com/users/12345',
            headers: [{ name: 'Authorization', value: 'Bearer jwt-token-here' }],
          },
          response: {
            status: 200,
            headers: [{ name: 'Content-Type', value: 'application/json' }],
            content: {
              mimeType: 'application/json',
              text: JSON.stringify({ id: '12345', name: 'Test User' }),
            },
          },
        },
      ],
    },
  };
}

function sampleAnalysis() {
  return {
    summary: {
      totalRequests: 2,
      uniqueEndpoints: 2,
      sensitiveFields: 2,
      extractedVariables: 2,
      dependencies: 1,
    },
    endpoints: ['POST /auth/login', 'GET /users/12345'],
    variables: [
      {
        name: 'auth_token',
        location: 'response[0].body.token',
        type: 'string',
        usedIn: [1],
        example: 'jwt-token-here',
      },
      {
        name: 'user_id',
        location: 'response[0].body.userId',
        type: 'string',
        usedIn: [1],
        example: '12345',
      },
    ],
    dependencies: [
      {
        from: 0,
        to: 1,
        variable: 'auth_token',
        extraction: 'response.body.token',
        injection: 'headers.Authorization',
      },
    ],
    sensitiveData: [
      { index: 0, type: 'request', category: 'password' },
      { index: 0, type: 'response', category: 'token' },
    ],
    requestChains: [
      { name: 'Authentication Flow', requests: [0, 1], purpose: 'Login and fetch user profile' },
    ],
    recommendations: [
      'Extract auth_token from login response',
      'Use environment variables for credentials',
    ],
  };
}

async function withFixture(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'opentest-render-'));
  const harPath = path.join(dir, 'render-test.har');
  await fs.writeFile(harPath, JSON.stringify(sampleHAR(), null, 2), 'utf-8');
  try {
    return await run(harPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('generateImports emits the dependencies the script needs', () => {
  const imports = generateImports();
  for (const expected of ['import os', 'import pytest', 'import requests', 'import json', 'from dotenv import load_dotenv']) {
    assert.ok(imports.includes(expected), `missing ${expected}`);
  }
});

test('generateConstants honours the base URL and defaults to localhost', () => {
  const constants = generateConstants(sampleAnalysis(), 'https://api.example.com');
  assert.ok(constants.includes('BASE_URL = os.getenv("API_BASE_URL", "https://api.example.com")'));
  assert.ok(constants.includes('TIMEOUT = int(os.getenv("API_TIMEOUT", "30"))'));
  assert.ok(constants.includes('VERIFY_SSL'));
  assert.ok(constants.includes('TEST_DATA = {'));

  assert.ok(generateConstants(sampleAnalysis(), null).includes('http://localhost:3000'));
});

test('generateEnvExample lists detected sensitive variables', () => {
  const envExample = generateEnvExample(sampleAnalysis());
  for (const expected of ['API_BASE_URL=', 'API_TIMEOUT=', 'VERIFY_SSL=', 'PASSWORD=', 'TOKEN=']) {
    assert.ok(envExample.includes(expected), `missing ${expected}`);
  }
});

test('generateEnvExample says so when nothing sensitive was found', () => {
  const envExample = generateEnvExample({ ...sampleAnalysis(), sensitiveData: [] });
  assert.ok(envExample.includes('No sensitive variables detected'));
});

test('generateTestReadme documents requirements, setup and run', () => {
  const readme = generateTestReadme('test_api_scenario', sampleAnalysis());
  for (const expected of [
    '# API Test: test_api_scenario',
    '## Requirements',
    'pip install pytest requests python-dotenv',
    '## Setup',
    '## Run',
    'pytest test_api_scenario.py',
    '## Analysis Summary',
    '**Total Requests**: 2',
    '**Extracted Variables**: 2',
    '## Extracted Variables',
    'auth_token',
    '## Request Dependencies',
    '## Recommendations',
  ]) {
    assert.ok(readme.includes(expected), `missing ${expected}`);
  }
});

test('renderHARToPytest produces a complete runnable script', async () => {
  await withFixture(async (harPath) => {
    const scripts = await renderHARToPytest(harPath, sampleAnalysis(), {
      testName: 'test_auth_flow',
      includeCleanup: true,
      includeAssertions: true,
    });

    assert.ok(scripts.pytestScript);
    assert.ok(scripts.envExample);
    assert.ok(scripts.readme);

    const script = scripts.pytestScript;
    for (const expected of [
      'import pytest',
      'import requests',
      'BASE_URL =',
      'TIMEOUT =',
      '@pytest.fixture',
      'def api_session():',
      'def setup_and_teardown():',
      'def cleanup_test_data():',
      'def test_auth_flow(api_session):',
      'api_session.post(',
      'api_session.get(',
      'assert response_0.status_code == 200',
      'assert response_1.status_code == 200',
      'TEST_DATA["auth_token"]',
      'def extract_json_value(',
      'def wait_for_async_operation(',
    ]) {
      assert.ok(script.includes(expected), `missing ${expected}`);
    }
  });
});

test('renderHARToPytest can leave out cleanup hooks', async () => {
  await withFixture(async (harPath) => {
    const { pytestScript } = await renderHARToPytest(harPath, sampleAnalysis(), {
      testName: 'test_no_cleanup',
      includeCleanup: false,
    });
    assert.ok(!pytestScript.includes('def setup_and_teardown():'));
    assert.ok(!pytestScript.includes('def cleanup_test_data():'));
  });
});

test('renderHARToPytest can leave out detailed assertions', async () => {
  await withFixture(async (harPath) => {
    const { pytestScript } = await renderHARToPytest(harPath, sampleAnalysis(), {
      testName: 'test_no_assertions',
      includeAssertions: false,
    });
    assert.ok(pytestScript.includes('def test_no_assertions(api_session):'));
  });
});

/**
 * Blank out string literals so a legitimate `"true"` is not mistaken for a
 * leaked JavaScript boolean.
 */
function stripStringLiterals(source) {
  return source.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""|'[^'\n]*'|"[^"\n]*"/g, '""');
}

test('renderHARToPytest leaks no JavaScript values', async () => {
  await withFixture(async (harPath) => {
    const { pytestScript } = await renderHARToPytest(harPath, sampleAnalysis());
    const code = stripStringLiterals(pytestScript);

    for (const leak of ['undefined', 'null', 'true', 'false']) {
      assert.ok(
        !new RegExp(`(?<!\\w)${leak}(?!\\w)`).test(code),
        `script leaked the JavaScript literal ${leak}`
      );
    }
    assert.ok(pytestScript.split('\n').some((line) => line.startsWith('    ')));
  });
});

test('renderHARToPytest labels each step for a human reader', async () => {
  await withFixture(async (harPath) => {
    const { pytestScript } = await renderHARToPytest(harPath, sampleAnalysis());
    assert.ok(pytestScript.includes('# Step 1:'));
    assert.ok(pytestScript.includes('# Step 2:'));
    assert.ok(pytestScript.includes('print(f"📤 Step'));
  });
});

test('renderHARToPytest respects baseUrl and timeout options', async () => {
  await withFixture(async (harPath) => {
    const staged = await renderHARToPytest(harPath, sampleAnalysis(), { baseUrl: 'https://staging.example.com' });
    assert.ok(staged.pytestScript.includes('https://staging.example.com'));

    const timed = await renderHARToPytest(harPath, sampleAnalysis(), { timeout: 60 });
    assert.ok(timed.pytestScript.includes('timeout=TIMEOUT'));
  });
});

test('renderHARToPytest still emits a valid script for an empty analysis', async () => {
  await withFixture(async (harPath) => {
    const scripts = await renderHARToPytest(harPath, {
      summary: {
        totalRequests: 2,
        uniqueEndpoints: 0,
        sensitiveFields: 0,
        extractedVariables: 0,
        dependencies: 0,
      },
      endpoints: [],
      variables: [],
      dependencies: [],
      sensitiveData: [],
      requestChains: [],
      recommendations: [],
    });

    assert.ok(scripts.pytestScript.includes('import pytest'));
    assert.ok(scripts.pytestScript.includes('def test_api_scenario(api_session):'));
  });
});

test('renderHARToPytest output keeps the documented structure', async () => {
  await withFixture(async (harPath) => {
    const { pytestScript, envExample, readme } = await renderHARToPytest(harPath, sampleAnalysis(), {
      testName: 'test_full_integration',
      baseUrl: 'https://api.example.com',
      timeout: 30,
      includeCleanup: true,
      includeAssertions: true,
    });

    assert.match(pytestScript, /"""[\s\S]*Auto-generated from HAR file[\s\S]*"""/);
    assert.ok(pytestScript.includes('@pytest.fixture'));
    assert.ok(pytestScript.includes('def test_full_integration(api_session):'));
    assert.ok(pytestScript.includes('def cleanup_test_data():'));

    assert.ok(envExample.includes('API_BASE_URL='));
    assert.ok(envExample.split('\n').length > 5);

    for (const expected of ['# API Test:', '## Overview', '## Requirements', '## Setup', '## Run', '## Analysis Summary']) {
      assert.ok(readme.includes(expected), `missing ${expected}`);
    }
  });
});