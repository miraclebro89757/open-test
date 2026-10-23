'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ensureRecordingBrowser, findLocalChrome } = require('./recording-browser');

test('local Chrome is used and nothing is downloaded', async () => {
  let installed = false;
  const browser = await ensureRecordingBrowser({
    findChrome: async () => ({ path: '/Applications/Google Chrome', version: '131.0.0.0' }),
    installChromium: async () => { installed = true; },
  });
  assert.equal(browser.source, 'chrome');
  assert.equal(browser.executablePath, '/Applications/Google Chrome');
  assert.equal(installed, false);
});

test('a machine without Chrome downloads the pinned browser', async () => {
  let installed = false;
  const browser = await ensureRecordingBrowser({
    findChrome: async () => null,
    installChromium: async () => { installed = true; },
  });
  assert.equal(browser.source, 'playwright');
  assert.equal(browser.executablePath, null);
  assert.equal(browser.version, '1.63.0');
  assert.equal(installed, true);
});

test('only Google Chrome counts as the local browser', () => {
  const chosen = findLocalChrome([
    { name: 'Edge', path: '/edge' },
    { name: 'Chrome', path: '/chrome', version: '1' },
  ]);
  assert.equal(chosen.path, '/chrome');
  assert.equal(findLocalChrome([{ name: 'Edge', path: '/edge' }]), null);
});
