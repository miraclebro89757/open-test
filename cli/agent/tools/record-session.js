'use strict';

const fs = require('fs');
const path = require('path');
const { parseCases, applyAutomationTags } = require('./record');

const FIELD_LINE = /^[-*]\s*([^：:\n]{1,12})[：:]\s*(.*)$/;
const STORAGE_STATE = 'automation/auth/admin.json';

function fieldValue(body, name) {
  for (const line of String(body || '').split('\n')) {
    const match = FIELD_LINE.exec(line);
    if (match && match[1].trim() === name) return match[2].trim();
  }
  return '';
}

function loadWorkspaceCases(workspace) {
  const dir = path.join(workspace, 'cases');
  if (!fs.existsSync(dir)) return [];
  const cases = [];
  for (const name of fs.readdirSync(dir).filter((item) => item.endsWith('.md')).sort()) {
    const relative = path.posix.join('cases', name);
    const markdown = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const item of parseCases(markdown)) {
      cases.push({
        file: relative,
        id: item.id,
        title: item.title,
        priority: fieldValue(item.body, '优先级'),
        automated: fieldValue(item.body, '自动化') === '是',
      });
    }
  }
  return cases;
}

/** High-priority cases are the core flows. When none exist, the session lists every case. */
function selectSessionCases(cases) {
  const core = cases.filter((item) => item.priority === '高');
  if (core.length) return { scope: 'core', cases: core };
  return { scope: 'all', cases: [...cases] };
}

function scriptName(id, title) {
  const clean = `${id}-${title}`
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${clean}.spec.ts`;
}

function renderSpecFile({ id, title, url, actions, storageState }) {
  const name = `${id} ${title}`.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const lines = (actions || []).map((line) => String(line || '').trim()).filter(Boolean);
  const steps = [];
  if (!lines.some((line) => /page\.goto\(/.test(line))) steps.push(`  await page.goto(${JSON.stringify(url)});`);
  lines.forEach((line) => steps.push(`  ${line.replace(/^\s+/, '')}`));
  return [
    "import { test } from '@playwright/test';",
    '',
    `test.use({ storageState: ${JSON.stringify(storageState)} });`,
    '',
    `test('${name}', async ({ page }) => {`,
    ...steps,
    '});',
    '',
  ].join('\n');
}

function controlPage() {
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<title>录制控制</title>
<style>
  body { font: 14px/1.5 sans-serif; margin: 16px; color: #1a1a1a; }
  button { height: 32px; margin: 4px 6px 4px 0; padding: 0 12px; cursor: pointer; }
  li { margin: 6px 0; }
  .current { font-weight: 700; }
</style>
</head>
<body>
<h1>录制控制</h1>
<p id="status">请在另一个窗口登录。登录完成后点下面的按钮，浏览器会保持打开。</p>
<button id="login" type="button">登录完成，开始录</button>
<div id="picker" hidden>
  <p id="scope"></p>
  <ul id="list"></ul>
  <button id="finish" type="button">全部录完，关闭浏览器</button>
</div>
<script>
  const status = document.getElementById('status');
  const picker = document.getElementById('picker');
  const list = document.getElementById('list');
  let cases = [];
  let current = '';
  function send(message) { return window.opentestRecord(message); }
  function render() {
    list.replaceChildren();
    for (const item of cases) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = current === item.id ? '正在录，这条录完' : '录这条';
      button.addEventListener('click', async () => {
        if (current === item.id) {
          current = '';
          status.textContent = '这条已保存。选择下一条，或结束录制。';
          render();
          await send({ type: 'stop' });
          return;
        }
        current = item.id;
        status.textContent = '正在录 ' + item.id + ' ' + item.title + '。在另一个窗口按这条用例操作，录完回到这里。';
        render();
        await send({ type: 'start', caseId: item.id });
      });
      row.append(button, document.createTextNode(' ' + item.id + ' ' + item.title));
      if (current === item.id) row.className = 'current';
      list.append(row);
    }
  }
  window.__setCases = (items, scope) => {
    cases = items;
    document.getElementById('scope').textContent = scope === 'core'
      ? '这些是优先级为高的核心流程。登录状态会保留，不必每条重新登录。'
      : '没有优先级为高的用例，这里列出全部用例。';
    render();
  };
  document.getElementById('login').addEventListener('click', async () => {
    document.getElementById('login').hidden = true;
    picker.hidden = false;
    status.textContent = '登录状态已保留。选择一条用例开始录。';
    await send({ type: 'login-done' });
  });
  document.getElementById('finish').addEventListener('click', async () => {
    status.textContent = '正在保存并关闭浏览器…';
    await send({ type: 'finish' });
  });
</script>
</body>
</html>`;
}

async function createPlaywrightRecordingSession({ sandboxUrl, cases, scope, executablePath, mode, harFile }) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: false,
    ...(executablePath ? { executablePath } : {}),
  });
  const contextOptions = {};
  if (mode !== 'ui-only' && harFile) {
    await fs.promises.mkdir(path.dirname(harFile), { recursive: true });
    contextOptions.recordHar = { path: harFile, mode: 'minimal' };
    contextOptions.serviceWorkers = 'block';
  }
  const context = await browser.newContext(contextOptions);
  const app = await context.newPage();
  await app.goto(sandboxUrl);
  const control = await context.newPage();
  const actions = [];
  let recording = false;
  const queue = [];
  const waiters = [];
  const push = (message) => {
    if (waiters.length) waiters.shift()(message);
    else queue.push(message);
  };
  await context._enableRecorder({
    language: 'playwright-test',
    mode: 'recording',
    recorderMode: 'api',
    omitCallTracking: true,
  }, {
    actionAdded(page, _action, code) {
      if (!recording || !code) return;
      const url = typeof page?.url === 'function' ? page.url() : '';
      if (!String(url).startsWith('http')) return;
      actions.push(code);
    },
    actionUpdated(page, _action, code) {
      if (!recording || !code) return;
      const url = typeof page?.url === 'function' ? page.url() : '';
      if (!String(url).startsWith('http')) return;
      if (actions.length) actions[actions.length - 1] = code;
      else actions.push(code);
    },
  });
  await control.exposeBinding('opentestRecord', async (_source, message) => {
    push(message);
  });
  browser.on('disconnected', () => push({ type: 'finish' }));
  await control.setContent(controlPage());
  await control.evaluate((payload) => window.__setCases(payload.cases, payload.scope), {
    cases: cases.map((item) => ({ id: item.id, title: item.title })),
    scope,
  });
  let closed = false;
  return {
    async wait() {
      if (queue.length) return queue.shift();
      return new Promise((resolve) => waiters.push(resolve));
    },
    start() {
      actions.length = 0;
      recording = true;
      app.bringToFront().catch(() => {});
    },
    async stop() {
      recording = false;
      const snapshot = actions.map((line) => String(line).trim()).filter(Boolean);
      actions.length = 0;
      let url = sandboxUrl;
      try {
        url = app.url() || sandboxUrl;
      } catch {
        // The page may already be gone.
      }
      return { actions: snapshot, url };
    },
    async saveStorage(file) {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await context.storageState({ path: file });
    },
    async close() {
      if (closed) return;
      closed = true;
      await browser.close().catch(() => {});
      return { har: harFile && fs.existsSync(harFile) ? harFile : '' };
    },
  };
}

async function runRecordingSession({
  workspace,
  sandboxUrl,
  confirm,
  openSession,
  cases,
  mode = 'ui-only',
}) {
  const catalog = cases || loadWorkspaceCases(workspace);
  const selected = selectSessionCases(catalog);
  if (!selected.cases.length) return { recorded: false, matches: [], message: '没有可录的用例。' };
  const allowed = await confirm(
    '浏览器只打开一次。先登录，再在控制页连续录多条核心流程。全部录完再关闭浏览器。脚本按用例编号和标题命名。',
  );
  if (!allowed) return { recorded: false, matches: [], message: '未打开沙箱，没有录制。' };

  const harFile = mode === 'ui-only' ? '' : path.join(workspace, 'automation', `session-${Date.now()}.har`);
  const session = await openSession({
    sandboxUrl,
    cases: selected.cases,
    scope: selected.scope,
    mode,
    harFile,
  });
  const byId = new Map(selected.cases.map((item) => [item.id, item]));
  const written = [];
  const skipped = [];
  let closed = false;
  let har = '';
  const closeOnce = async () => {
    if (closed) return;
    closed = true;
    const closedSession = await session.close();
    har = closedSession && closedSession.har ? closedSession.har : '';
  };

  async function take(caseId) {
    const item = byId.get(caseId);
    const segment = await session.stop();
    if (!item) {
      skipped.push(`${caseId} 不在这次可录的用例里`);
      return;
    }
    if (!segment.actions.length) {
      skipped.push(`${item.id} 没有录到操作`);
      return;
    }
    const relative = path.posix.join('automation', scriptName(item.id, item.title));
    const absolute = path.join(workspace, relative);
    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    await fs.promises.writeFile(absolute, renderSpecFile({
      id: item.id,
      title: item.title,
      url: segment.url || sandboxUrl,
      actions: segment.actions,
      storageState: STORAGE_STATE,
    }));
    const caseFile = path.join(workspace, item.file);
    const markdown = await fs.promises.readFile(caseFile, 'utf8');
    await fs.promises.writeFile(caseFile, applyAutomationTags(markdown, {
      matchedIds: new Set([item.id]),
      specPaths: [relative],
      onlyMatched: true,
    }));
    written.push({ id: item.id, file: item.file, uiSpec: relative });
  }

  try {
    let current = null;
    let loggedIn = false;
    while (true) {
      const message = await session.wait();
      if (!message || message.type === 'finish') {
        if (current) await take(current);
        break;
      }
      if (!loggedIn) {
        if (message.type === 'login-done') {
          loggedIn = true;
          await session.saveStorage(path.join(workspace, STORAGE_STATE));
        }
        continue;
      }
      if (message.type === 'start') {
        if (current) await take(current);
        current = message.caseId;
        session.start();
      } else if (message.type === 'stop') {
        if (current) await take(current);
        current = null;
      }
    }
  } finally {
    await closeOnce();
  }

  if (!written.length) {
    return {
      recorded: false,
      matches: [],
      message: skipped.length ? skipped.join('；') : '没有录到用例。',
    };
  }
  const lines = [
    `录制完成，浏览器已关闭。共 ${written.length} 条。`,
    ...written.map((item) => `${item.id} → ${item.uiSpec}`),
  ];
  if (skipped.length) lines.push(skipped.join('；'));
  if (har) lines.push(`整段会话的 HAR：${path.relative(workspace, har)}`);
  return { recorded: true, matches: written, message: lines.join('\n') };
}

module.exports = {
  selectSessionCases,
  scriptName,
  renderSpec: renderSpecFile,
  loadWorkspaceCases,
  runRecordingSession,
  createPlaywrightRecordingSession,
};
