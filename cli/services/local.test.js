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
      calls.push({ file, args, auth: options && options.env && options.env.NEO4J_AUTH });
    },
  });
  const up = calls.find((call) => call.args.includes('up'));
  assert.equal(up.file, 'docker');
  assert.deepEqual(up.args.slice(0, 3), ['compose', '-f', composeFile()]);
  assert.equal(calls.some((call) => call.args[0] === 'image' && call.args[1] === 'inspect'), true);
  assert.equal(calls.some((call) => call.args.some((arg) => String(arg).includes(started.password))), false);
  assert.equal(started.message.includes(started.password), false);
  assert.equal(fs.readFileSync(servicesFile(home), 'utf8').includes(started.password), true);
  assert.equal(graphEnv(home, {}).NEO4J_URI, 'bolt://127.0.0.1:7687');
  assert.deepEqual(graphEnv(home, { NEO4J_URI: 'bolt://example:7687', NEO4J_USER: 'a', NEO4J_PASSWORD: 'b' }), {});
});

test('a Docker Hub timeout retries the image from the mirror', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-services-'));
  const calls = [];
  await startGraphService({
    homeDir: home,
    probe: async () => calls.some((call) => call.args.includes('up')),
    execFile(file, args) {
      calls.push({ file, args });
      if (args[0] === 'image') {
        const error = new Error('failed');
        throw error;
      }
      if (args[0] === 'pull' && args[1] === 'neo4j:5.24-community') {
        const error = new Error('Head "https://registry-1.docker.io/v2/library/neo4j/manifests/5.24-community": context deadline exceeded');
        throw error;
      }
    },
  });
  assert.equal(calls.some((call) => call.args[1] === 'm.daocloud.io/docker.io/library/neo4j:5.24-community'), true);
  assert.equal(calls.filter((call) => call.args.includes('up')).length, 1);
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
