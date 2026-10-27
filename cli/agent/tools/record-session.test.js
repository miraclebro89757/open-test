'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { selectSessionCases, scriptName, renderSpec, replaySpec, runRecordingSession, controlPage } = require('./record-session');

const CASES = [
  { file: 'cases/班组.md', id: 'TC012', title: '新建作业班组', priority: '高', automated: false },
  { file: 'cases/班组.md', id: 'TC013', title: '打开项目列表', priority: '中', automated: false },
  { file: 'cases/班组.md', id: 'TC015', title: '作业班组重名时提示', priority: '高', automated: false },
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

test('a session offers core journeys that need a Playwright recording, including ones already automated', () => {
  const selected = selectSessionCases(CASES);
  assert.equal(selected.scope, 'record');
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

test('a capture replays as the original case, and a login recording starts signed out', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-replay-'));
  const storage = path.join(workspace, 'recordings', 'ui-1', 'storage-state.json');
  fs.mkdirSync(path.dirname(storage), { recursive: true });
  fs.writeFileSync(storage, '{}');
  const signedIn = replaySpec({
    caseId: 'TC100',
    title: '编辑自定义工种',
    pageUrl: 'https://sandbox.example/app',
    sandboxUrl: 'https://sandbox.example/login',
    storageState: 'recordings/ui-1/storage-state.json',
    actions: ['await page.locator(".menu").click();', "await expect(page.getByText('已保存')).toBeVisible();"],
  }, workspace);
  assert.match(signedIn, /import \{ test, expect \}/);
  assert.match(signedIn, /test\('TC100 编辑自定义工种'/);
  assert.match(signedIn, /page\.goto\("https:\/\/sandbox\.example\/app"\)/);
  assert.match(signedIn, new RegExp(storage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const login = replaySpec({
    caseId: 'TC099',
    title: '新建自定义工种',
    pageUrl: 'https://sandbox.example/app',
    sandboxUrl: 'https://sandbox.example/login',
    storageState: 'recordings/ui-1/storage-state.json',
    actions: ["await page1.getByRole('button', { name: '登录' }).click();"],
  }, workspace);
  assert.match(login, /page\.getByRole\('button', \{ name: '登录' \}\)/);
  assert.doesNotMatch(login, /page1/);
  assert.doesNotMatch(login, /storageState/);
  assert.match(login, /page\.goto\("https:\/\/sandbox\.example\/login"\)/);
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
  assert.doesNotMatch(saved, /自动化：是|脚本：/);
  assert.equal(fs.existsSync(path.join(workspace, 'automation')), false);
  const captures = fs.readdirSync(path.join(workspace, 'recordings')).filter((name) => name.startsWith('ui-'));
  assert.equal(captures.length, 2);
  const read = (folder) => JSON.parse(fs.readFileSync(path.join(workspace, 'recordings', folder, 'capture.json'), 'utf8'));
  const byCase = Object.fromEntries(captures.map((folder) => {
    const capture = read(folder);
    return [capture.caseId, capture];
  }));
  assert.equal(byCase.TC012.kind, 'ui');
  assert.deepEqual(byCase.TC012.actions, actions.TC012);
  assert.equal(byCase.TC012.teardown_strategy, 'none');
  assert.match(byCase.TC012.storageState, /^recordings\/ui-/);
  assert.equal(byCase.TC014.caseFile, 'cases/班组.md');
  assert.doesNotMatch(byCase.TC014.actions.join('\n'), /新建/);
  assert.equal(fs.existsSync(path.join(workspace, byCase.TC012.storageState)), true);
});

test('a chosen case is captured even when it is not high priority', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-session-'));
  fs.mkdirSync(path.join(workspace, 'cases'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'cases', '班组.md'), `# 功能用例-班组

### TC013 作业班组重名时提示
- 优先级：中
- 步骤：
  1. 再新建一个同名班组
`);
  const result = await runRecordingSession({
    workspace,
    sandboxUrl: 'https://sandbox.example/app',
    caseId: 'TC013',
    confirm: async () => true,
    openSession: async ({ cases }) => ({
      async wait() { return this.events.shift(); },
      events: [{ type: 'login-done' }, { type: 'start', caseId: 'TC013' }, { type: 'stop' }, { type: 'finish' }],
      start() {},
      async stop() { return { actions: ['await page.getByRole("button", { name: "保存" }).click();'], url: 'https://sandbox.example/teams' }; },
      async saveStorage(file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, '{}');
      },
      async close() {},
      openedCases: cases,
    }),
  });
  assert.equal(result.recorded, true);
  assert.equal(result.matches[0].id, 'TC013');
  const folder = fs.readdirSync(path.join(workspace, 'recordings')).find((name) => name.startsWith('ui-'));
  const capture = JSON.parse(fs.readFileSync(path.join(workspace, 'recordings', folder, 'capture.json'), 'utf8'));
  assert.match(capture.actions[0], /保存/);
  assert.match(capture.pageUrl, /teams/);
});

test('api recording is refused before the browser opens', async () => {
  let opened = false;
  const result = await runRecordingSession({
    workspace: fs.mkdtempSync(path.join(os.tmpdir(), 'opentest-session-')),
    sandboxUrl: 'https://sandbox.example/app',
    mode: 'api-only',
    confirm: async () => { throw new Error('confirm should not run'); },
    openSession: async () => { opened = true; },
  });
  assert.equal(opened, false);
  assert.equal(result.recorded, false);
  assert.match(result.message, /API recording is not available/);
});
