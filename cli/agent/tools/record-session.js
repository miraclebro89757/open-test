'use strict';

const fs = require('fs');
const path = require('path');
const { parseCases, applyAutomationTags } = require('./record');
const { uiLocale, uiText } = require('../ui-copy');
const { needsPlaywrightRecording } = require('./recording-need');

const FIELD_LINE = /^[-*]\s*([^：:\n]{1,12})[：:]\s*(.*)$/;

function fieldValue(body, name) {
  for (const line of String(body || '').split('\n')) {
    const match = FIELD_LINE.exec(line);
    if (match && match[1].trim() === name) return match[2].trim();
  }
  return '';
}

/** A case field and the indented lines under it, until the next field. */
function fieldBlock(body, name) {
  const lines = String(body || '').split('\n');
  const start = lines.findIndex((line) => {
    const match = FIELD_LINE.exec(line);
    return match && match[1].trim() === name;
  });
  if (start < 0) return '';
  const first = FIELD_LINE.exec(lines[start]);
  const collected = [first ? first[2] : ''];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (FIELD_LINE.test(lines[index]) || /^#{1,6}\s/.test(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected.join('\n').trim();
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
        recording: fieldValue(item.body, '录制'),
        automated: fieldValue(item.body, '自动化') === '是',
        steps: fieldBlock(item.body, '步骤'),
        expected: fieldBlock(item.body, '期望结果'),
      });
    }
  }
  return cases;
}

/** Cases marked for Playwright regression. An explicit 录制 field wins over the title rule. */
function selectSessionCases(cases) {
  return { scope: 'record', cases: cases.filter((item) => needsPlaywrightRecording(item)) };
}

function scriptName(id, title) {
  const clean = `${id}-${title}`
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${clean}.spec.ts`;
}

function normalizeAction(line) {
  return String(line || '').trim().replace(/\bpage1\b/g, 'page');
}

/** A capture becomes a temporary Playwright spec. Login steps start at the sandbox and do not reuse storage. */
function replaySpec(capture, workspace) {
  const actions = (Array.isArray(capture.actions) ? capture.actions : []).map(normalizeAction).filter(Boolean);
  const login = actions.some((line) => /登录|请输入手机号|请输入用户名|获取验证码/.test(line));
  let storageState = '';
  if (!login && capture.storageState && workspace) {
    const root = path.resolve(workspace);
    const absolute = path.resolve(root, capture.storageState);
    const relative = path.relative(root, absolute);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && fs.existsSync(absolute)) storageState = absolute;
  }
  const url = login ? (capture.sandboxUrl || capture.pageUrl || '') : (capture.pageUrl || capture.sandboxUrl || '');
  return renderSpecFile({
    id: capture.caseId || capture.capture_id || 'capture',
    title: capture.title || '',
    url,
    actions,
    storageState,
  });
}

function renderSpecFile({ id, title, url, actions, storageState }) {
  const name = `${id} ${title}`.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const lines = (actions || []).map((line) => String(line || '').trim()).filter(Boolean);
  const steps = [];
  if (!lines.some((line) => /page\.goto\(/.test(line))) steps.push(`  await page.goto(${JSON.stringify(url)});`);
  lines.forEach((line) => steps.push(`  ${line.replace(/^\s+/, '')}`));
  const header = ["import { test, expect } from '@playwright/test';", ''];
  if (storageState) header.push(`test.use({ storageState: ${JSON.stringify(storageState)} });`, '');
  return [
    ...header,
    `test('${name}', async ({ page }) => {`,
    ...steps,
    '});',
    '',
  ].join('\n');
}

function controlPage() {
  const text = {
    loginPrompt: uiText('record.control.loginPrompt'),
    scopeCore: uiText('record.control.scopeCore'),
    scopeAll: uiText('record.control.scopeAll'),
    scopeChosen: uiText('record.control.scopeChosen'),
    record: uiText('record.control.record'),
    recording: uiText('record.control.recording'),
    saved: uiText('record.control.saved'),
    recordingStatus: uiText('record.control.recordingStatus'),
    loggedIn: uiText('record.control.loggedIn'),
    closing: uiText('record.control.closing'),
  };
  return `<!doctype html>
<html lang="${uiLocale()}">
<head>
<meta charset="utf-8" />
<title>${uiText('record.control.title')}</title>
<style>
  body { margin: 0; background: #f4f5f7; color: #1c1c1c; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 28px 20px 48px; }
  h1 { margin: 0 0 8px; font-size: 20px; font-weight: 650; }
  #status { margin: 0 0 16px; color: #3a3a3a; }
  button { height: 32px; padding: 0 12px; border: 1px solid #c8c8c8; border-radius: 6px; background: #fff; color: #1c1c1c; cursor: pointer; }
  button.primary { background: #1a56db; border-color: #1a56db; color: #fff; }
  #scope { margin: 0 0 8px; color: #3a3a3a; }
  ul { list-style: none; margin: 0 0 16px; padding: 0; }
  li { display: flex; flex-direction: column; align-items: stretch; gap: 6px; margin: 8px 0; padding: 8px 10px; border: 1px solid #e2e2e2; border-radius: 8px; background: #fff; }
  li.current { border-color: #1a56db; }
  .head { display: flex; align-items: center; gap: 10px; }
  .name { min-width: 0; }
  .steps { margin: 0; white-space: pre-wrap; color: #3a3a3a; font: 13px/1.5 inherit; }
</style>
</head>
<body>
<main>
<h1>${uiText('record.control.title')}</h1>
<p id="status">${text.loginPrompt}</p>
<button id="login" class="primary" type="button">${uiText('record.control.loginButton')}</button>
<div id="picker" hidden>
  <p id="scope"></p>
  <ul id="list"></ul>
  <button id="finish" class="primary" type="button">${uiText('record.control.finish')}</button>
</div>
</main>
<script>
  const text = ${JSON.stringify(text)};
  const status = document.getElementById('status');
  const picker = document.getElementById('picker');
  const list = document.getElementById('list');
  let cases = [];
  let current = '';
  function send(message) { return window.opentestRecord(message); }
  function fill(template, item) {
    return template.replaceAll('{id}', item.id).replaceAll('{title}', item.title);
  }
  function render() {
    list.replaceChildren();
    for (const item of cases) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = current === item.id ? text.recording : text.record;
      button.addEventListener('click', async () => {
        if (current === item.id) {
          current = '';
          status.textContent = text.saved;
          render();
          await send({ type: 'stop' });
          return;
        }
        current = item.id;
        status.textContent = fill(text.recordingStatus, item);
        render();
        await send({ type: 'start', caseId: item.id });
      });
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = item.id + ' ' + item.title;
      const head = document.createElement('div');
      head.className = 'head';
      head.append(button, name);
      row.append(head);
      if (item.steps) {
        const steps = document.createElement('pre');
        steps.className = 'steps';
        steps.textContent = item.steps;
        row.append(steps);
      }
      if (current === item.id) row.className = 'current';
      list.append(row);
    }
  }
  window.__setCases = (items, scope) => {
    cases = items;
    const scopeText = scope === 'record' || scope === 'core' ? text.scopeCore : scope === 'chosen' ? text.scopeChosen : text.scopeAll;
    document.getElementById('scope').textContent = scopeText;
    render();
  };
  document.getElementById('login').addEventListener('click', async () => {
    document.getElementById('login').hidden = true;
    picker.hidden = false;
    status.textContent = text.loggedIn;
    await send({ type: 'login-done' });
  });
  document.getElementById('finish').addEventListener('click', async () => {
    status.textContent = text.closing;
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
    cases: cases.map((item) => ({ id: item.id, title: item.title, steps: item.steps || '' })),
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

function captureFolderName() {
  return `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** One UI segment becomes a capture asset. It is not a runnable script. */
function writeUiCapture(workspace, {
  caseId = '',
  title = '',
  caseFile = '',
  sandboxUrl,
  pageUrl,
  actions,
  storageStateFile = '',
  now = Date.now(),
}) {
  const folder = captureFolderName();
  const dir = path.join(workspace, 'recordings', folder);
  fs.mkdirSync(dir, { recursive: true });
  let storageState = '';
  if (storageStateFile && fs.existsSync(storageStateFile)) {
    fs.copyFileSync(storageStateFile, path.join(dir, 'storage-state.json'));
    storageState = path.posix.join('recordings', folder, 'storage-state.json');
  }
  const capture = {
    capture_id: folder,
    kind: 'ui',
    caseId,
    title,
    caseFile,
    sandboxUrl,
    pageUrl: pageUrl || sandboxUrl,
    environment: sandboxUrl,
    recordedAt: new Date(now).toISOString(),
    actions,
    storageState,
    created_resources: [],
    teardown_strategy: 'none',
    cleanup_scope: '',
    cleanup_note: 'UI capture does not plan cleanup. Server resource ids are recorded when a test runs.',
  };
  const file = path.posix.join('recordings', folder, 'capture.json');
  fs.writeFileSync(path.join(workspace, file), `${JSON.stringify(capture, null, 2)}\n`);
  return { id: caseId || folder, captureId: folder, file, caseFile };
}

function listUiCaptures(workspace) {
  const dir = path.join(workspace, 'recordings');
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const name of fs.readdirSync(dir)) {
    const absolute = path.join(dir, name, 'capture.json');
    if (!fs.existsSync(absolute)) continue;
    try {
      const capture = JSON.parse(fs.readFileSync(absolute, 'utf8'));
      if (capture.kind !== 'ui') continue;
      found.push({
        id: String(capture.capture_id || name),
        caseId: String(capture.caseId || ''),
        title: String(capture.title || ''),
        recordedAt: String(capture.recordedAt || ''),
        actions: Array.isArray(capture.actions) ? capture.actions.length : 0,
        file: path.posix.join('recordings', name, 'capture.json'),
      });
    } catch {
      // A half-written capture is skipped until it can be read.
    }
  }
  return found.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}

async function runRecordingSession({
  workspace,
  sandboxUrl,
  confirm,
  openSession,
  cases,
  caseId = '',
  mode = 'ui-only',
}) {
  if (mode === 'api-only') {
    return { recorded: false, matches: [], message: 'API recording is not available yet.' };
  }
  const catalog = cases || loadWorkspaceCases(workspace);
  let selected;
  if (caseId) {
    const chosen = catalog.find((item) => item.id === caseId);
    if (!chosen) return { recorded: false, matches: [], message: `Case ${caseId} was not found` };
    selected = { scope: 'chosen', cases: [chosen] };
  } else {
    selected = selectSessionCases(catalog);
  }
  if (!selected.cases.length) return { recorded: false, matches: [], message: 'No cases need a Playwright recording.' };
  const allowed = await confirm(uiText('record.hint'));
  if (!allowed) return { recorded: false, matches: [], message: 'The sandbox was not opened, so nothing was recorded.' };

  const session = await openSession({
    sandboxUrl,
    cases: selected.cases,
    scope: selected.scope,
    mode: 'ui-only',
    harFile: '',
  });
  const byId = new Map(selected.cases.map((item) => [item.id, item]));
  const written = [];
  const skipped = [];
  let closed = false;
  const storageStateFile = path.join(workspace, 'recordings', '.session', 'storage-state.json');
  const closeOnce = async () => {
    if (closed) return;
    closed = true;
    await session.close();
  };

  async function take(currentId) {
    const item = byId.get(currentId);
    const segment = await session.stop();
    if (!item) {
      skipped.push(`${currentId} is not in this recording list`);
      return;
    }
    if (!segment.actions.length) {
      skipped.push(`${item.id} recorded no actions`);
      return;
    }
    written.push(writeUiCapture(workspace, {
      caseId: item.id,
      title: item.title,
      caseFile: item.file,
      sandboxUrl,
      pageUrl: segment.url,
      actions: segment.actions,
      storageStateFile,
    }));
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
          await session.saveStorage(storageStateFile);
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
      message: skipped.length ? skipped.join('; ') : 'No case was recorded.',
    };
  }
  const lines = [
    uiText('record.done', { count: written.length }),
    ...written.map((item) => `${item.id} → ${item.file}`),
  ];
  if (skipped.length) lines.push(skipped.join('; '));
  return { recorded: true, matches: written, message: lines.join('\n') };
}

module.exports = {
  selectSessionCases,
  scriptName,
  renderSpec: renderSpecFile,
  replaySpec,
  loadWorkspaceCases,
  controlPage,
  writeUiCapture,
  listUiCaptures,
  runRecordingSession,
  createPlaywrightRecordingSession,
};
