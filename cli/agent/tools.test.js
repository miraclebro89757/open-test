'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { healSelector } = require('./tools/heal');
const { runPlaywright } = require('./tools/playwright');
const { fetchDefects } = require('./tools/defects');
const { buildReport, signRelease } = require('./tools/report');
const { gitDiffImpact } = require('./tools/git-diff');
const { productWorkspace, sanitizeProductName } = require('./tools/workspace');
const { atToken, createDocumentAutocomplete, documentSuggestions, parentToken, pathSuggestions, mergeSuggestions } = require('./document-complete');
const { blockBuiltinPromptEdit } = require('./extension');
const { analysisPromptFile } = require('./prompts');

test('heal selector waits for confirmation and can be declined', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-heal-'));
  const file = path.join(dir, 'login.spec.ts');
  fs.writeFileSync(file, "page.locator('#old')");
  const declined = await healSelector({
    cwd: dir,
    filePath: 'login.spec.ts',
    oldSelector: '#old',
    newSelector: '#new',
    confirm: async () => false,
    readFile: fs.promises.readFile,
    writeFile: fs.promises.writeFile,
  });
  assert.equal(declined.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), "page.locator('#old')");
  const accepted = await healSelector({
    cwd: dir,
    filePath: 'login.spec.ts',
    oldSelector: '#old',
    newSelector: '#new',
    confirm: async () => true,
    readFile: fs.promises.readFile,
    writeFile: fs.promises.writeFile,
  });
  assert.equal(accepted.changed, true);
  assert.equal(fs.readFileSync(file, 'utf8'), "page.locator('#new')");
});

test('heal selector rejects a path outside the project', async () => {
  await assert.rejects(() => healSelector({
    cwd: '/work',
    filePath: '../secret.spec.ts',
    oldSelector: 'a',
    newSelector: 'b',
    confirm: async () => true,
    readFile: async () => 'a',
    writeFile: async () => {},
  }), /outside/);
});

test('playwright tool only accepts a spec path', async () => {
  await assert.rejects(() => runPlaywright({
    cwd: '/work',
    specFile: 'package.json',
    execFile: async () => ({ stdout: '', exitCode: 0 }),
  }), /Playwright spec/);
});

test('playwright tool returns parsed stats', async () => {
  const result = await runPlaywright({
    cwd: '/work',
    specFile: 'tests/login.spec.ts',
    execFile: async () => ({
      stdout: JSON.stringify({ stats: { expected: 2, unexpected: 1, skipped: 0 }, errors: [] }),
      exitCode: 1,
    }),
  });
  assert.match(result.text, /"unexpected":1/);
});

test('defect fetch does not invent bugs without credentials', async () => {
  const result = await fetchDefects({ env: {}, fetchImpl: async () => { throw new Error('network'); } });
  assert.equal(result.configured, false);
  assert.deepEqual(result.bugs, []);
});

test('report counts only local case headings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-report-'));
  const workspace = path.join(dir, '易训');
  fs.mkdirSync(path.join(workspace, 'cases'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'cases', 'login.md'), '## TC-1\n## TC-2\n');
  const report = buildReport(workspace);
  assert.equal(report.caseCount, 2);
  assert.match(report.text, /用例标题 2 条/);
});

test('release sign-off is not written when confirmation is declined', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-sign-'));
  let written = false;
  const result = await signRelease({
    workspace: path.join(dir, '易训'),
    summary: '通过',
    confirm: async () => false,
    writeFile: async () => { written = true; },
    username: 'qa',
  });
  assert.equal(result.signed, false);
  assert.equal(written, false);
});

test('product workspace is a visible directory named after the product', () => {
  assert.equal(productWorkspace('/Users/me/Desktop/易训', '筑安通'), '/Users/me/Desktop/易训/筑安通');
  assert.equal(productWorkspace('/Users/me/Desktop/易训', '.筑安通'), '/Users/me/Desktop/易训/筑安通');
  assert.equal(sanitizeProductName('绩效管理'), '绩效管理');
  assert.throws(() => sanitizeProductName('...'), /产品项目名/);
  assert.notEqual(path.basename(productWorkspace('/tmp/docs', '筑安通')).startsWith('.'), true);
});

test('git diff impact matches case files by changed basename', () => {
  const result = gitDiffImpact({
    cwd: '/work',
    execFileSync: () => ' M src/login.ts\n',
    readCases: () => [{ name: 'login.md', text: 'covers login.ts' }, { name: 'pay.md', text: 'covers pay.ts' }],
  });
  assert.deepEqual(result.cases, ['login.md']);
});

test('builtin analysis prompt cannot be overwritten', () => {
  const builtin = analysisPromptFile();
  const blocked = blockBuiltinPromptEdit({ toolName: 'edit', input: { path: builtin } }, '/work');
  assert.equal(blocked.block, true);
  const custom = blockBuiltinPromptEdit({
    toolName: 'write',
    input: { path: '/Users/me/.opentest/pi-agent/prompts/my-review.md' },
  }, '/work');
  assert.equal(custom, null);
});

test('extension registers the terminal tools', async () => {
  const extension = require('./extension');
  const names = [];
  await extension({ registerTool(tool) { names.push(tool.name); } });
  assert.deepEqual(names, [
    'run_playwright_test',
    'heal_selector',
    'fetch_zentao_jira',
    'write_executive_report',
    'sign_release',
    'git_diff_impact',
  ]);
});

test('@ with no path lists the document folder and its entries', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-docs-home-'));
  fs.mkdirSync(path.join(home, 'Documents', '项目'), { recursive: true });
  fs.writeFileSync(path.join(home, 'Documents', '登录需求.md'), '# 登录');
  fs.mkdirSync(path.join(home, 'Desktop'));
  const items = documentSuggestions('', home);
  assert.equal(items[0].label, '文档/');
  assert.equal(items[0].value, '@~/Documents/');
  assert.equal(items.some((item) => item.label === '项目/'), true);
  assert.equal(items.some((item) => item.value === '@~/Documents/登录需求.md'), true);
  assert.equal(documentSuggestions('登录', home).some((item) => item.label === '登录需求.md'), true);
  const nested = pathSuggestions('~/Documents/项目/', home);
  assert.equal(nested[0].label, '../');
  assert.equal(nested[0].value, '@~/Documents/');
  fs.writeFileSync(path.join(home, 'Documents', '项目', '登录.md'), '# 登录');
  const inside = pathSuggestions('~/Documents/项目/', home);
  assert.equal(inside.some((item) => item.value === '@~/Documents/项目/登录.md'), true);
  assert.equal(parentToken('@~/Documents/项目/'), '@~/Documents/');
  assert.equal(parentToken('@~/Documents/'), '@');
});

test('@ autocomplete forwards options.signal to the built-in provider', async () => {
  const signal = new AbortController().signal;
  const calls = [];
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-at-home-'));
  const provider = createDocumentAutocomplete({
    async getSuggestions(_lines, _line, _col, options) {
      calls.push(options);
      return { prefix: '@', items: [{ value: '@cli/', label: 'cli/' }] };
    },
    applyCompletion() {
      return { lines: ['@'], cursorLine: 0, cursorCol: 1 };
    },
  }, home);
  const bare = await provider.getSuggestions(['@'], 0, 1, { signal });
  const drilled = await provider.getSuggestions(['@~/Documents/'], 0, '@~/Documents/'.length, { signal });
  assert.equal(calls[0].signal, signal);
  assert.equal(calls[1].signal, signal);
  assert.equal(bare.items.some((item) => item.label === 'cli/'), true);
  assert.deepEqual(drilled.items, [{ value: '@cli/', label: 'cli/' }]);
});

test('@ token is taken from the end of the line and merged ahead of project files', () => {
  assert.equal(atToken('请读 @'), '@');
  assert.equal(atToken('请读 @需求'), '@需求');
  const merged = mergeSuggestions(
    [{ value: '@~/Documents/', label: '文档/', description: '~/Documents' }],
    { prefix: '@', items: [{ value: '@cli/', label: 'cli/' }] },
    '@',
  );
  assert.equal(merged.items[0].label, '文档/');
  assert.equal(merged.items[1].label, 'cli/');
});
