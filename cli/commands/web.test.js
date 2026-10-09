'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { launchWeb, webCommand } = require('./web');

test('web command exports launchWeb', () => {
  assert.equal(typeof launchWeb, 'function');
});

test('with a production build it starts the bundled Pi Web launcher', () => {
  const command = webCommand({
    root: '/repo', port: 8080, hostname: 'localhost', noOpen: true, exists: () => true,
  });
  assert.equal(command.mode, 'start');
  assert.equal(command.args[0], path.join('/repo', 'bin', 'pi-web.js'));
  assert.deepEqual(command.args.slice(1), ['--port', '8080', '--hostname', 'localhost', '--no-open']);
});

test('without a build it falls back to next dev on the same address', () => {
  const root = path.join(__dirname, '..', '..');
  const command = webCommand({ root, port: 30142, hostname: '127.0.0.1', noOpen: false, exists: () => false });
  assert.equal(command.mode, 'dev');
  assert.deepEqual(command.args.slice(1), ['dev', '-H', '127.0.0.1', '-p', '30142']);
});

test('the web command never repoints the agent directory away from the terminal', () => {
  const source = require('fs').readFileSync(path.join(__dirname, 'web.js'), 'utf8');
  assert.equal(/PI_CODING_AGENT_DIR\s*[:=]/.test(source), false);
  assert.equal(source.includes('@agegr/pi-web'), false);
});
