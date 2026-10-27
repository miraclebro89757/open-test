'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parseRecordingMode,
  getModeConfirmationMessage,
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

test('the confirmation message follows the UI language and has no color codes', () => {
  const previous = process.env.OPENTEST_UI_LOCALE;
  try {
    process.env.OPENTEST_UI_LOCALE = 'en';
    const message = getModeConfirmationMessage('ui+api', 'https://example.test/login');
    assert.match(message, /Recording mode/);
    assert.match(message, /UI \+ API/);
    assert.match(message, /Playwright UI capture/);
    assert.match(message, /https:\/\/example\.test\/login/);
    assert.doesNotMatch(message, /\x1b|\[\d+m|同时录制/);
    process.env.OPENTEST_UI_LOCALE = 'zh-CN';
    const chinese = getModeConfirmationMessage('ui+api', 'https://example.test/login');
    assert.match(chinese, /录制模式/);
    assert.match(chinese, /同时录制/);
    assert.doesNotMatch(chinese, /\x1b|\[\d+m/);
  } finally {
    if (previous === undefined) delete process.env.OPENTEST_UI_LOCALE;
    else process.env.OPENTEST_UI_LOCALE = previous;
  }
});

test('ui+api is marked as recommended', () => {
  assert.strictEqual(RECORDING_MODES['ui+api'].recommended, true);
});
