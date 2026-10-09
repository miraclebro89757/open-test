'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPiArgs, composeSystemPrompt, expandAttachments, launchAgent } = require('./launch');
const { DEFAULT_ANALYSIS_PROMPT, bundledPromptsDir } = require('./prompts');

function baseArgs(extra = {}) {
  return buildPiArgs({
    words: [],
    skill: '/skills/opentest-qa',
    extension: '/extensions/opentest.js',
    prompt: '只做测试',
    promptTemplate: '/prompts',
    ...extra,
  });
}

test('pi arguments keep @ files and the read-only tool set', () => {
  const args = baseArgs({ words: ['@/tmp/req.md', '生成用例'], print: true });
  assert.equal(args.includes('@/tmp/req.md'), true);
  assert.equal(args.includes('--print'), true);
  assert.equal(args.includes('--no-approve'), true);
  assert.equal(args.includes('--skill'), true);
  assert.equal(args.includes('--extension'), true);
  assert.equal(args.includes('--prompt-template'), true);
  assert.equal(args.includes('/prompts'), true);
  assert.equal(args.includes('--no-prompt-templates'), false);
  assert.equal(args.includes('/extensions/opentest.js'), true);
  assert.match(args.find((arg) => arg.includes('run_playwright_test')), /heal_selector/);
});

test('pi arguments never choose a model, so Pi uses the one set in Pi Web', () => {
  const args = baseArgs();
  assert.equal(args.includes('--provider'), false);
  assert.equal(args.includes('--model'), false);
  assert.equal(args.includes('--models'), false);
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

function launchWith(env, homeDir) {
  let spawned = null;
  launchAgent({
    words: [],
    cwd: '/work',
    env,
    homeDir,
    exists: () => true,
    spawnImpl: (bin, args, options) => {
      spawned = { bin, args, options };
      return {};
    },
  });
  return spawned;
}

test('the terminal runs on the same agent directory Pi Web uses', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-home-'));
  const spawned = launchWith({ PATH: '/bin' }, home);
  // The launcher leaves the directory alone, so Pi falls back to ~/.pi/agent.
  assert.equal('PI_CODING_AGENT_DIR' in spawned.options.env, false);
  assert.equal(spawned.options.env.PI_TELEMETRY, '0');
  // It does not write a second models.json for the terminal.
  assert.equal(fs.existsSync(path.join(home, '.opentest')), false);
  assert.equal(fs.existsSync(path.join(home, '.pi', 'agent', 'models.json')), false);
  // Custom prompts live where Pi itself looks for them.
  assert.equal(fs.existsSync(path.join(home, '.pi', 'agent', 'prompts')), true);
});

test('a PI_CODING_AGENT_DIR chosen by the user is passed through untouched', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-home-'));
  const custom = path.join(home, 'custom-agent');
  const spawned = launchWith({ PATH: '/bin', PI_CODING_AGENT_DIR: custom }, home);
  assert.equal(spawned.options.env.PI_CODING_AGENT_DIR, custom);
  assert.equal(fs.existsSync(path.join(custom, 'prompts')), true);
  assert.equal(fs.existsSync(path.join(custom, 'models.json')), false);
});

test('default analysis prompt is a read-only version selected with /', () => {
  const file = path.join(bundledPromptsDir(), `${DEFAULT_ANALYSIS_PROMPT}.md`);
  const text = fs.readFileSync(file, 'utf8');
  const skill = fs.readFileSync(path.join(__dirname, '..', '..', '.pi', 'skills', 'opentest-qa', 'SKILL.md'), 'utf8');
  assert.match(text, /ISO 29148/);
  assert.match(text, /六流/);
  assert.match(text, /只读/);
  assert.equal(text.includes('$1'), false);
  assert.match(skill, /~\/\.pi\/agent\/prompts/);
  const prompt = composeSystemPrompt('只做测试', {
    version: DEFAULT_ANALYSIS_PROMPT,
    promptFile: file,
    promptsDir: '/tmp/prompts',
  });
  assert.match(prompt, new RegExp(`/${DEFAULT_ANALYSIS_PROMPT}`));
  assert.match(prompt, /只读/);
});
