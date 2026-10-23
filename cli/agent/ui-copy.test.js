'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { uiText } = require('./ui-copy');

test('recording copy uses the same placeholders in every language', () => {
  const previous = process.env.OPENTEST_UI_LOCALE;
  const placeholder = /\{[a-z]+\}/g;
  try {
    process.env.OPENTEST_UI_LOCALE = 'en';
    const sample = uiText('record.control.recordingStatus', { id: 'TC1', title: 'Login' });
    assert.equal(sample.includes('{'), false);
    assert.match(sample, /TC1/);
    for (const locale of ['zh-CN', 'zh-TW']) {
      process.env.OPENTEST_UI_LOCALE = 'en';
      const english = uiText('record.done', { count: 2 });
      process.env.OPENTEST_UI_LOCALE = locale;
      const translated = uiText('record.done', { count: 2 });
      assert.deepEqual(english.match(placeholder), translated.match(placeholder));
      assert.doesNotMatch(translated, /\[36m|\x1b/);
    }
  } finally {
    if (previous === undefined) delete process.env.OPENTEST_UI_LOCALE;
    else process.env.OPENTEST_UI_LOCALE = previous;
  }
});
