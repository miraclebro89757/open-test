'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { composeFile, graphEnv, prepareGraphService, servicesFile, startGraphService } = require('./local');

test('starting the packaged neo4j does not print or pass the password on docker args', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-services-'));
  const calls = [];
  const started = await startGraphService({
    homeDir: home,
    probe: async () => calls.length > 0,
    execFile(file, args, options) {
      calls.push({ file, args, auth: options.env.NEO4J_AUTH });
    },
  });
  assert.equal(calls[0].file, 'docker');
  assert.deepEqual(calls[0].args.slice(0, 3), ['compose', '-f', composeFile()]);
  assert.equal(calls[0].args.includes('up'), true);
  assert.equal(calls[0].args.includes('neo4j'), true);
  assert.equal(calls[0].args.some((arg) => String(arg).includes(started.password)), false);
  assert.equal(started.message.includes(started.password), false);
  assert.equal(fs.readFileSync(servicesFile(home), 'utf8').includes(started.password), true);
  assert.equal(graphEnv(home, {}).NEO4J_URI, 'bolt://127.0.0.1:7687');
  assert.deepEqual(graphEnv(home, { NEO4J_URI: 'bolt://example:7687', NEO4J_USER: 'a', NEO4J_PASSWORD: 'b' }), {});
});

test('opening the agent asks once and then carries the saved connection', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-services-'));
  const declined = await prepareGraphService({
    homeDir: home,
    interactive: true,
    confirm: async () => false,
    probe: async () => false,
  });
  assert.match(declined.message, /npx open-test services/);
  assert.equal(declined.env.NEO4J_URI, undefined);
  const accepted = await prepareGraphService({
    homeDir: home,
    interactive: true,
    confirm: async () => true,
    probe: async () => false,
    start: async () => ({
      uri: 'bolt://127.0.0.1:7687',
      user: 'neo4j',
      password: 'secret-token',
      message: 'Neo4j 已启动。',
    }),
  });
  assert.equal(accepted.env.NEO4J_PASSWORD, 'secret-token');
  assert.equal(accepted.message.includes('secret-token'), false);
});
