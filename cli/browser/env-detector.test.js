'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { detectSystemBrowsers, getBrowserSizeEstimate, pathExists } = require('./env-detector');

test('detectSystemBrowsers should return an array', async () => {
  const browsers = await detectSystemBrowsers();
  assert.ok(Array.isArray(browsers), 'Should return an array');
  
  // If browsers are found, they should have required fields
  browsers.forEach(browser => {
    assert.ok(browser.name, 'Browser should have name');
    assert.ok(browser.type, 'Browser should have type');
    assert.ok(browser.path, 'Browser should have path');
    assert.ok(browser.version, 'Browser should have version');
  });
});

test('getBrowserSizeEstimate should return size info', () => {
  const sizes = getBrowserSizeEstimate();
  assert.ok(sizes.download, 'Should have download size');
  assert.ok(sizes.disk, 'Should have disk size');
});

test('pathExists should work correctly', async () => {
  // Test with a path that should exist (current file)
  const exists = await pathExists(__filename);
  assert.strictEqual(exists, true, 'Current file should exist');
  
  // Test with a path that should not exist
  const notExists = await pathExists('/this/path/should/not/exist/hopefully');
  assert.strictEqual(notExists, false, 'Non-existent path should return false');
});
