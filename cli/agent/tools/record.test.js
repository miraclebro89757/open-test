'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseCases, recordingPhrases, matchRecording, applyAutomationTags, recordScenario } = require('./record');

const CASES = `# 功能用例

### TC001 用户登录
- 编号：TC001
- 优先级：高
- 步骤：打开登录页，输入账号密码

### TC002 查询课程列表
- 编号：TC002
- 优先级：中
- 步骤：点击课程管理，查看列表
`;

test('parseCases splits numbered cases with their bodies', () => {
  const cases = parseCases(CASES);
  assert.equal(cases.length, 2);
  assert.equal(cases[0].id, 'TC001');
  assert.equal(cases[0].title, '用户登录');
  assert.ok(cases[0].body.includes('打开登录页'));
  assert.ok(!cases[0].body.includes('TC002'));
  assert.equal(cases[1].id, 'TC002');
});

test('recordingPhrases pulls locator text out of a recorded spec', () => {
  const spec = `
    await page.getByText('登录').click();
    await page.getByPlaceholder('请输入账号').fill('a');
    await page.getByLabel('密码').fill('b');
    await page.getByText('x').click();
  `;
  const phrases = recordingPhrases(spec);
  assert.ok(phrases.includes('登录'));
  assert.ok(phrases.includes('请输入账号'));
  assert.ok(phrases.includes('密码'));
  assert.ok(!phrases.includes('x'), 'single characters are too weak to match on');
});

test('matchRecording attaches the recording to the overlapping case', () => {
  const result = matchRecording(parseCases(CASES), ['课程管理', '查看列表'], null);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].id, 'TC002');
});

test('matchRecording honours an explicit case id', () => {
  const result = matchRecording(parseCases(CASES), ['登录'], 'TC001');
  assert.deepEqual(result.matches.map((item) => item.id), ['TC001']);
});

test('matchRecording refuses to guess between two identical wordings', () => {
  const ambiguous = '### TC010 A\n步骤：提交\n\n### TC011 B\n步骤：提交\n';
  const result = matchRecording(parseCases(ambiguous), ['提交'], null);
  assert.equal(result.matches.length, 0);
  assert.match(result.message, /用例编号/);
});

test('a matched case records both the UI and the API script', () => {
  const output = applyAutomationTags(CASES, {
    matchedIds: new Set(['TC001']),
    specPaths: ['automation/TC001.spec.ts', 'automation/test_api_TC001.py'],
  });

  const [first, second] = parseCases(output);
  assert.match(first.body, /^- 自动化：是$/m);
  assert.match(first.body, /^- 脚本：automation\/TC001\.spec\.ts，automation\/test_api_TC001\.py$/m);
  assert.match(second.body, /^- 自动化：否$/m);
});

test('a ui-only recording does not claim an API script', () => {
  const output = applyAutomationTags(CASES, {
    matchedIds: new Set(['TC001']),
    specPaths: ['automation/TC001.spec.ts'],
  });
  assert.match(output, /^- 脚本：automation\/TC001\.spec\.ts$/m);
});

test('re-tagging a case replaces the script list instead of appending a duplicate', () => {
  const once = applyAutomationTags(CASES, {
    matchedIds: new Set(['TC001']),
    specPaths: ['automation/TC001.spec.ts', 'automation/test_api_TC001.py'],
  });
  const twice = applyAutomationTags(once, {
    matchedIds: new Set(['TC001']),
    specPaths: ['automation/TC001-v2.spec.ts'],
  });

  const body = parseCases(twice)[0].body;
  assert.equal((body.match(/^- 脚本：/gm) || []).length, 1);
  assert.match(body, /^- 脚本：automation\/TC001-v2\.spec\.ts$/m);
});

test('an existing 自动化 tag is left alone for unmatched cases', () => {
  const tagged = CASES.replace('- 优先级：高', '- 优先级：高\n- 自动化：是');
  const output = applyAutomationTags(tagged, { matchedIds: new Set(), specPaths: ['automation/TC001.spec.ts'] });
  assert.match(parseCases(output)[0].body, /^- 自动化：是$/m);
});

test('a document without cases is left untouched', () => {
  assert.equal(applyAutomationTags('# 只有标题\n', { matchedIds: new Set(['TC001']), specPaths: ['a.ts'] }), '# 只有标题\n');
});
test('the recording wizard choices reach the generated API script', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'record-wizard-'));
  const har = {
    log: {
      entries: [{
        startedDateTime: '2024-01-01T10:00:00.000Z',
        time: 10,
        request: { method: 'GET', url: 'https://api.example.com/api/items', headers: [] },
        response: { status: 200, headers: [], content: { mimeType: 'application/json', text: '{"id":"1"}' } },
      }],
    },
  };
  const result = await recordScenario({
    workspace,
    sandboxUrl: 'https://sandbox.example.com',
    caseId: 'TC001',
    mode: 'api-only',
    cleanup: { pre: false, post: true },
    skipBrowserCheck: true,
    now: () => 1700000000000,
    confirm: async () => true,
    execFile: async (_file, args) => {
      fs.writeFileSync(args[args.indexOf('--save-har') + 1], JSON.stringify(har));
    },
  });
  assert.equal(result.recorded, true);
  const script = fs.readFileSync(result.apiScript.pytestFile, 'utf8');
  assert.ok(script.includes('post-test cleanup'));
  assert.ok(!script.includes('pre-test cleanup'));
  // The analysis is kept next to the scripts so the Web wizard can show it.
  assert.ok(fs.existsSync(path.join(workspace, 'automation', 'TC001-1700000000000.analysis.json')));
});
