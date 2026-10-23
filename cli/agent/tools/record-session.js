'use strict';

const fs = require('fs');
const path = require('path');
const { parseCases, applyAutomationTags } = require('./record');
const { uiLocale, uiText } = require('../ui-copy');

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
  const text = {
    loginPrompt: uiText('record.control.loginPrompt'),
    scopeCore: uiText('record.control.scopeCore'),
    scopeAll: uiText('record.control.scopeAll'),
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
  li { display: flex; align-items: center; gap: 10px; margin: 8px 0; padding: 8px 10px; border: 1px solid #e2e2e2; border-radius: 8px; background: #fff; }
  li.current { border-color: #1a56db; }
  .name { min-width: 0; }
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
      row.append(button, name);
      if (current === item.id) row.className = 'current';
      list.append(row);
    }
  }
  window.__setCases = (items, scope) => {
    cases = items;
    document.getElementById('scope').textContent = scope === 'core' ? text.scopeCore : text.scopeAll;
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
  if (!selected.cases.length) return { recorded: false, matches: [], message: 'No cases are available to record.' };
  const allowed = await confirm(uiText('record.hint'));
  if (!allowed) return { recorded: false, matches: [], message: 'The sandbox was not opened, so nothing was recorded.' };

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
      skipped.push(`${caseId} is not in this recording list`);
      return;
    }
    if (!segment.actions.length) {
      skipped.push(`${item.id} recorded no actions`);
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
      message: skipped.length ? skipped.join('; ') : 'No case was recorded.',
    };
  }
  const lines = [
    uiText('record.done', { count: written.length }),
    ...written.map((item) => `${item.id} → ${item.uiSpec}`),
  ];
  if (skipped.length) lines.push(skipped.join('; '));
  if (har) lines.push(uiText('record.har', { path: path.relative(workspace, har) }));
  return { recorded: true, matches: written, message: lines.join('\n') };
}

module.exports = {
  selectSessionCases,
  scriptName,
  renderSpec: renderSpecFile,
  loadWorkspaceCases,
  controlPage,
  runRecordingSession,
  createPlaywrightRecordingSession,
};
