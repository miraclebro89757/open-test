'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parseRecordingMode,
  getModeDescription,
  getModeIcon,
  producesUIScript,
  producesAPIScript,
  RECORDING_MODES,
} = require('./record-mode-selector');

test('parseRecordingMode handles valid modes', () => {
  assert.strictEqual(parseRecordingMode('ui+api'), 'ui+api');
  assert.strictEqual(parseRecordingMode('ui-only'), 'ui-only');
  assert.strictEqual(parseRecordingMode('api-only'), 'api-only');
});

test('parseRecordingMode handles aliases', () => {
  assert.strictEqual(parseRecordingMode('both'), 'ui+api');
  assert.strictEqual(parseRecordingMode('all'), 'ui+api');
  assert.strictEqual(parseRecordingMode('ui-api'), 'ui+api');
  assert.strictEqual(parseRecordingMode('ui'), 'ui-only');
  assert.strictEqual(parseRecordingMode('api'), 'api-only');
});

test('parseRecordingMode is case-insensitive', () => {
  assert.strictEqual(parseRecordingMode('UI+API'), 'ui+api');
  assert.strictEqual(parseRecordingMode('UI-ONLY'), 'ui-only');
  assert.strictEqual(parseRecordingMode('API-ONLY'), 'api-only');
});

test('parseRecordingMode handles default', () => {
  assert.strictEqual(parseRecordingMode(), 'ui+api');
  assert.strictEqual(parseRecordingMode(''), 'ui+api');
  assert.strictEqual(parseRecordingMode(null), 'ui+api');
});

test('parseRecordingMode throws on invalid mode', () => {
  assert.throws(() => parseRecordingMode('invalid'), /Invalid recording mode/);
  assert.throws(() => parseRecordingMode('xyz'), /Invalid recording mode/);
});

test('getModeDescription returns correct description', () => {
  const desc = getModeDescription('ui+api');
  assert.ok(desc.includes('同时录制'));
});

test('getModeIcon returns correct icon', () => {
  assert.strictEqual(getModeIcon('ui+api'), '🎬');
  assert.strictEqual(getModeIcon('ui-only'), '🖱️');
  assert.strictEqual(getModeIcon('api-only'), '🔌');
});

test('producesUIScript correctly identifies UI modes', () => {
  assert.strictEqual(producesUIScript('ui+api'), true);
  assert.strictEqual(producesUIScript('ui-only'), true);
  assert.strictEqual(producesUIScript('api-only'), false);
});

test('producesAPIScript correctly identifies API modes', () => {
  assert.strictEqual(producesAPIScript('ui+api'), true);
  assert.strictEqual(producesAPIScript('ui-only'), false);
  assert.strictEqual(producesAPIScript('api-only'), true);
});

test('RECORDING_MODES has all required modes', () => {
  assert.ok(RECORDING_MODES['ui+api']);
  assert.ok(RECORDING_MODES['ui-only']);
  assert.ok(RECORDING_MODES['api-only']);
  
  // Check structure
  Object.values(RECORDING_MODES).forEach(config => {
    assert.ok(config.label);
    assert.ok(config.description);
    assert.ok(config.icon);
    assert.ok(Array.isArray(config.produces));
    assert.ok(config.useCase);
  });
});

test('ui+api is marked as recommended', () => {
  assert.strictEqual(RECORDING_MODES['ui+api'].recommended, true);
});
