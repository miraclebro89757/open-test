'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPiArgs, composeSystemPrompt, expandAttachments, modelsDocument, providerId, writePiHome } = require('./launch');
const { DEFAULT_ANALYSIS_PROMPT, bundledPromptsDir } = require('./prompts');

const SECRET = 'sk-or-v1-test-secret-value';

test('openrouter and deepseek map to pi provider ids', () => {
  assert.equal(providerId('https://openrouter.ai/api/v1'), 'openrouter');
  assert.equal(providerId('https://api.deepseek.com/v1'), 'deepseek');
  assert.equal(providerId('http://localhost:11434/v1'), 'opentest');
});

test('models.json stores an env reference, not the key', () => {
  const doc = modelsDocument({
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'stealth/space-bunny-alpha',
    apiKey: SECRET,
  });
  const text = JSON.stringify(doc);
  assert.equal(doc.providers.openrouter.apiKey, '$OPENTEST_API_KEY');
  assert.equal(text.includes(SECRET), false);
  assert.equal(doc.providers.openrouter.models[0].id, 'stealth/space-bunny-alpha');
});

test('pi arguments keep @ files and never include the key', () => {
  const args = buildPiArgs({
    config: {
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'stealth/space-bunny-alpha',
      apiKey: SECRET,
    },
    words: ['@/tmp/req.md', '生成用例'],
    print: true,
    skill: '/skills/opentest-qa',
    extension: '/extensions/opentest.js',
    prompt: '只做测试',
    promptTemplate: '/prompts',
  });
  assert.equal(args.includes(SECRET), false);
  assert.equal(args.includes('@/tmp/req.md'), true);
  assert.equal(args.includes('--print'), true);
  assert.equal(args.includes('--no-approve'), true);
  assert.equal(args.includes('--skill'), true);
  assert.equal(args.includes('--extension'), true);
  assert.equal(args.includes('--prompt-template'), true);
  assert.equal(args.includes('/prompts'), true);
  assert.equal(args.includes('--no-prompt-templates'), false);
  assert.equal(args.includes('/extensions/opentest.js'), true);
  assert.equal(args.includes('run_playwright_test'), false);
  assert.match(args.find((arg) => arg.includes('run_playwright_test')), /heal_selector/);
});

test('a docx attachment is extracted before pi sees it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-attach-'));
  const words = expandAttachments(['@spec.docx', '生成用例'], {
    cwd: '/work',
    tmpDir: dir,
    exists: () => true,
    extract: () => '登录需求',
    write: (file, text) => fs.writeFileSync(file, text),
  });
  assert.equal(words[1], '生成用例');
  assert.equal(words[0].startsWith('@'), true);
  assert.equal(path.extname(words[0].slice(1)), '.md');
  assert.equal(fs.readFileSync(words[0].slice(1), 'utf8'), '登录需求');
});

test('written models file does not contain the key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-pi-'));
  const file = writePiHome({
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'demo-model',
    apiKey: SECRET,
  }, dir);
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text.includes(SECRET), false);
  assert.match(text, /\$OPENTEST_API_KEY/);
  assert.equal(fs.existsSync(path.join(dir, 'prompts')), true);
});

test('default analysis prompt is a read-only version selected with /', () => {
  const file = path.join(bundledPromptsDir(), `${DEFAULT_ANALYSIS_PROMPT}.md`);
  const text = fs.readFileSync(file, 'utf8');
  const skill = fs.readFileSync(path.join(__dirname, '..', '..', '.pi', 'skills', 'opentest-qa', 'SKILL.md'), 'utf8');
  assert.match(text, /ISO 29148/);
  assert.match(text, /六流/);
  assert.match(text, /只读/);
  assert.equal(text.includes('$1'), false);
  assert.match(skill, /~\/\.opentest\/pi-agent\/prompts/);
  const prompt = composeSystemPrompt('只做测试', {
    version: DEFAULT_ANALYSIS_PROMPT,
    promptFile: file,
    promptsDir: '/tmp/prompts',
  });
  assert.match(prompt, new RegExp(`/${DEFAULT_ANALYSIS_PROMPT}`));
  assert.match(prompt, /只读/);
});
