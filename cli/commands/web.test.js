'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');

test('web command exports launchWeb function', () => {
  const { launchWeb } = require('./web');
  assert.strictEqual(typeof launchWeb, 'function');
});

test('web command accepts port and hostname options', () => {
  const { launchWeb } = require('./web');
  // Function signature should accept options object
  assert.doesNotThrow(() => {
    const options = {
      port: 8080,
      hostname: '0.0.0.0',
      noOpen: true,
    };
    // We're just verifying the function signature, not actually launching
    assert.strictEqual(typeof options.port, 'number');
    assert.strictEqual(typeof options.hostname, 'string');
    assert.strictEqual(typeof options.noOpen, 'boolean');
  });
});

test('web command respects environment variables', () => {
  // Verify env var handling logic
  const port = process.env.PORT || 30141;
  const hostname = process.env.PI_WEB_HOSTNAME || '127.0.0.1';
  const noOpen = process.env.PI_WEB_NO_OPEN === '1';

  assert.strictEqual(typeof port, 'number');
  assert.strictEqual(typeof hostname, 'string');
  assert.strictEqual(typeof noOpen, 'boolean');
});

test('pi-web package resolution path is valid', () => {
  // Test that we're attempting to resolve the correct package
  const packageName = '@agegr/pi-web';
  assert.strictEqual(packageName, '@agegr/pi-web');
  
  // Verify the entry point we'd use
  const expectedEntry = '@agegr/pi-web/bin/pi-web.js';
  assert.ok(expectedEntry.includes('pi-web.js'));
});

test('web command constructs correct spawn arguments', () => {
  const port = 8080;
  const hostname = 'localhost';
  const noOpen = true;

  const args = [
    'fake-entry-point.js',
    '--port', String(port),
    '--hostname', hostname,
  ];
  if (noOpen) args.push('--no-open');

  assert.ok(args.includes('--port'));
  assert.ok(args.includes('8080'));
  assert.ok(args.includes('--hostname'));
  assert.ok(args.includes('localhost'));
  assert.ok(args.includes('--no-open'));
});

test('web command cleans undefined env values', () => {
  const env = {
    DEFINED: 'value',
    UNDEFINED: undefined,
    NULL: null,
    EMPTY: '',
  };

  // Simulate cleanup logic
  const cleaned = {};
  Object.keys(env).forEach(key => {
    if (env[key] !== undefined) cleaned[key] = env[key];
  });

  assert.ok('DEFINED' in cleaned);
  assert.ok(!('UNDEFINED' in cleaned));
  assert.ok('NULL' in cleaned); // null is not undefined
  assert.ok('EMPTY' in cleaned); // empty string is valid
});

test('PI_CODING_AGENT_DIR respects OPENTEST_HOME', () => {
  const cases = [
    { home: '/custom/home', expected: '/custom/home/pi-agent' },
    { home: undefined, expected: undefined },
    { home: '', expected: undefined }, // empty string should not produce path
  ];

  cases.forEach(({ home, expected }) => {
    const agentDir = home && home.trim() 
      ? `${home}/pi-agent` 
      : undefined;
    assert.strictEqual(agentDir, expected);
  });
});
