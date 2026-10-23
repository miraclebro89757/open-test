'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { selectSessionCases, scriptName, renderSpec, runRecordingSession, controlPage } = require('./record-session');

const CASES = [
  { file: 'cases/班组.md', id: 'TC012', title: '新建作业班组', priority: '高', automated: false },
  { file: 'cases/班组.md', id: 'TC013', title: '作业班组重名时提示', priority: '中', automated: false },
  { file: 'cases/登录.md', id: 'TC001', title: '管理员登录', priority: '高', automated: true },
];

test('the control page follows the UI language and does not print color codes', () => {
  const previous = process.env.OPENTEST_UI_LOCALE;
  try {
    process.env.OPENTEST_UI_LOCALE = 'en';
    const html = controlPage();
    assert.match(html, /<html lang="en">/);
    assert.match(html, /Recording/);
    assert.match(html, /Logged in, start recording/);
    assert.doesNotMatch(html, /录制控制|\x1b|\[\d+m/);
    process.env.OPENTEST_UI_LOCALE = 'zh-CN';
    const chinese = controlPage();
    assert.match(chinese, /录制控制/);
    assert.match(chinese, /登录完成，开始录/);
  } finally {
    if (previous === undefined) delete process.env.OPENTEST_UI_LOCALE;
    else process.env.OPENTEST_UI_LOCALE = previous;
  }
});

test('a session offers high-priority cases, including ones already automated', () => {
  const selected = selectSessionCases(CASES);
  assert.equal(selected.scope, 'core');
  assert.deepEqual(selected.cases.map((item) => item.id), ['TC012', 'TC001']);
});

test('the script file and test title use the case id and title', () => {
  assert.equal(scriptName('TC012', '新建作业班组'), 'TC012-新建作业班组.spec.ts');
  const spec = renderSpec({
    id: 'TC012',
    title: '新建作业班组',
    url: 'https://sandbox.example/app',
    actions: ['await page.getByRole("button", { name: "新建" }).click();'],
    storageState: 'automation/auth/admin.json',
  });
  assert.match(spec, /test\('TC012 新建作业班组'/);
  assert.match(spec, /storageState: "automation\/auth\/admin\.json"/);
  assert.match(spec, /page\.goto\("https:\/\/sandbox\.example\/app"\)/);
  assert.match(spec, /getByRole\("button", \{ name: "新建" \}\)/);
});

test('one login records several cases and closes the browser once', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-session-'));
  fs.mkdirSync(path.join(workspace, 'cases'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'cases', '班组.md'), `# 功能用例-班组

### TC012 新建作业班组
- 优先级：高
- 自动化：否
- 步骤：
  1. 新建一个作业班组

### TC014 打开班组列表
- 优先级：高
- 步骤：
  1. 打开班组列表

### TC013 作业班组重名时提示
- 优先级：中
- 步骤：
  1. 再新建一个同名班组
`);
  const actions = {
    TC012: ['await page.getByRole("button", { name: "新建" }).click();'],
    TC014: ['await page.getByText("班组列表").click();'],
  };
  let closed = 0;
  let opened = 0;
  const result = await runRecordingSession({
    workspace,
    sandboxUrl: 'https://sandbox.example/app',
    confirm: async () => true,
    openSession: async () => ({
      async wait() {
        return this.events.shift();
      },
      events: [
        { type: 'login-done' },
        { type: 'start', caseId: 'TC012' },
        { type: 'stop' },
        { type: 'start', caseId: 'TC014' },
        { type: 'stop' },
        { type: 'finish' },
      ],
      start() {},
      async stop() {
        const id = this.events[0] && this.events[0].type === 'start' ? null : null;
        return { actions: this.nextActions.shift(), url: 'https://sandbox.example/teams' };
      },
      nextActions: [actions.TC012, actions.TC014],
      async saveStorage(file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, '{}');
      },
      async close() { closed += 1; },
    }),
  });
  opened += 1;
  assert.equal(opened, 1);
  assert.equal(closed, 1);
  assert.equal(result.recorded, true);
  assert.deepEqual(result.matches.map((item) => item.id), ['TC012', 'TC014']);
  const saved = fs.readFileSync(path.join(workspace, 'cases', '班组.md'), 'utf8');
  assert.match(saved, /### TC012 新建作业班组[\s\S]*- 自动化：是/);
  assert.match(saved, /### TC012 新建作业班组[\s\S]*- 脚本：automation\/TC012-新建作业班组\.spec\.ts/);
  assert.match(saved, /### TC014 打开班组列表[\s\S]*- 自动化：是/);
  assert.match(saved, /### TC014 打开班组列表[\s\S]*- 脚本：automation\/TC014-打开班组列表\.spec\.ts/);
  assert.doesNotMatch(saved, /### TC013[\s\S]*- 自动化：/);
  const first = fs.readFileSync(path.join(workspace, 'automation', 'TC012-新建作业班组.spec.ts'), 'utf8');
  assert.match(first, /test\('TC012 新建作业班组'/);
  assert.doesNotMatch(first, /班组列表/);
  const second = fs.readFileSync(path.join(workspace, 'automation', 'TC014-打开班组列表.spec.ts'), 'utf8');
  assert.match(second, /test\('TC014 打开班组列表'/);
  assert.doesNotMatch(second, /新建" \)/);
});
