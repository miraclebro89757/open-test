'use strict';

const fs = require('fs');
const path = require('path');

const TASKS = [
  ['analysis', '需求分析'],
  ['test-points', '测试点'],
  ['cases', '功能用例'],
  ['record', '沙箱录制'],
  ['heal', '选择器自愈'],
  ['defects', '缺陷'],
  ['report', '测试简报'],
];

function checkpointDir(workspace) {
  return path.join(workspace, 'tasks');
}

function emptyState(product, sourceFile) {
  const tasks = {};
  TASKS.forEach(([id, title]) => {
    tasks[id] = { id, title, status: 'pending', steps: [] };
  });
  return { product: product || '', sourceFile: sourceFile || '', startedAt: '', tasks };
}

function loadState(workspace, product, sourceFile) {
  const file = path.join(checkpointDir(workspace), 'checkpoint.json');
  if (!fs.existsSync(file)) return emptyState(product, sourceFile);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const state = emptyState(saved.product || product, saved.sourceFile || sourceFile);
  state.startedAt = saved.startedAt || '';
  TASKS.forEach(([id, title]) => {
    const task = saved.tasks && saved.tasks[id];
    if (!task) return;
    state.tasks[id] = {
      id,
      title,
      status: task.status || 'pending',
      steps: Array.isArray(task.steps) ? task.steps.map((step) => ({
        id: String(step.id),
        status: step.status || 'pending',
        note: step.note || '',
      })) : [],
    };
  });
  return state;
}

function refresh(task) {
  if (!task.steps.length) {
    task.status = 'pending';
    return;
  }
  if (task.steps.every((step) => step.status === 'done')) task.status = 'done';
  else if (task.steps.some((step) => step.status === 'failed')) task.status = 'failed';
  else if (task.steps.some((step) => step.status === 'done')) task.status = 'in_progress';
  else task.status = 'pending';
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderBar(title, done, total, { next = '', failed = 0, startedAt = '', now = Date.now(), width = 24 } = {}) {
  const safeTotal = Math.max(0, total);
  const safeDone = Math.max(0, Math.min(done, safeTotal || done));
  const ratio = safeTotal ? safeDone / safeTotal : 0;
  const filled = safeTotal ? Math.min(width, Math.round(ratio * width)) : 0;
  const percent = String(Math.round(ratio * 100)).padStart(3);
  const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
  const fail = failed ? ` 失败${failed}` : '';
  let clock = '';
  if (startedAt && safeTotal) {
    const elapsed = Math.max(0, now - Date.parse(startedAt));
    const remain = safeDone > 0 && safeDone < safeTotal ? (elapsed / safeDone) * (safeTotal - safeDone) : 0;
    clock = remain ? ` [${formatDuration(elapsed)}<${formatDuration(remain)}]` : ` [${formatDuration(elapsed)}]`;
  }
  const tail = next ? ` ${next}` : (safeTotal ? '' : ' 尚未分节');
  return `${title} ${percent}%|${bar}| ${safeDone}/${safeTotal}${fail}${clock}${tail}`;
}

function renderBars(state, now = Date.now()) {
  let doneAll = 0;
  let totalAll = 0;
  let failedAll = 0;
  let nextLabel = '';
  const lines = [];
  TASKS.forEach(([id, title]) => {
    const task = state.tasks[id];
    if (!task) return;
    const total = task.steps.length;
    if (!total) return;
    const done = task.steps.filter((step) => step.status === 'done').length;
    const failed = task.steps.filter((step) => step.status === 'failed').length;
    const next = task.steps.find((step) => step.status === 'failed' || step.status === 'pending');
    doneAll += done;
    totalAll += total;
    failedAll += failed;
    if (!nextLabel && next) nextLabel = `${title} ${next.id}`;
    if (next) lines.push(renderBar(title, done, total, { next: next.id, failed, width: 16 }));
  });
  if (!totalAll) return [renderBar(state.product || '任务', 0, 0, { next: '尚未分节' })];
  return [renderBar(state.product || '任务', doneAll, totalAll, {
    next: nextLabel, failed: failedAll, startedAt: state.startedAt, now,
  }), ...lines].slice(0, 8);
}

function renderStatus(state, now = Date.now()) {
  const lines = [...renderBars(state, now), '', `# ${state.product || '产品'} 任务进度`, '', `来源：${state.sourceFile || '未记录'}`, ''];
  const resume = [];
  TASKS.forEach(([id, title]) => {
    const task = state.tasks[id];
    const done = task.steps.filter((step) => step.status === 'done').length;
    const next = task.steps.find((step) => step.status === 'failed' || step.status === 'pending');
    const label = { pending: '未开始', in_progress: '进行中', failed: '失败', done: '已完成' }[task.status] || task.status;
    lines.push(`- ${title}：${label}。已完成 ${done} 步。${next ? `下一步 ${next.id}。` : ''}`);
    if (next) resume.push(`${title} / ${next.id}`);
  });
  lines.push('', resume.length ? `从这些步骤继续，不要重做已完成步骤：${resume.join('；')}` : '已登记的步骤都完成了。');
  return `${lines.join('\n')}\n`;
}

function saveState(workspace, state) {
  const dir = checkpointDir(workspace);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'checkpoint.json'), `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'status.md'), renderStatus(state));
}

function taskOf(state, taskId) {
  const task = state.tasks[taskId];
  if (!task) throw new Error(`未知任务 ${taskId}。可用任务：${TASKS.map(([id]) => id).join(', ')}`);
  return task;
}

function parseSteps(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const text = String(value || '').trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text).map((item) => String(item).trim()).filter(Boolean);
  return text.split('\n').map((item) => item.trim()).filter(Boolean);
}

function planSteps(task, stepIds) {
  const existing = new Set(task.steps.map((step) => step.id));
  stepIds.forEach((id) => {
    if (!existing.has(id)) task.steps.push({ id, status: 'pending', note: '' });
  });
  refresh(task);
}

function setStep(task, stepId, status, note) {
  const id = String(stepId || '').trim();
  if (!id) throw new Error('step 不能为空');
  let step = task.steps.find((item) => item.id === id);
  if (!step) {
    step = { id, status, note: note || '' };
    task.steps.push(step);
  } else {
    step.status = status;
    if (note) step.note = note;
  }
  refresh(task);
}

function updateCheckpoint(workspace, { product, sourceFile, action = 'status', task, steps, step, note } = {}) {
  const state = loadState(workspace, product, sourceFile);
  if (product) state.product = product;
  if (sourceFile) state.sourceFile = sourceFile;
  if (action === 'plan') {
    planSteps(taskOf(state, task), parseSteps(steps));
  } else if (action === 'complete') {
    setStep(taskOf(state, task), step, 'done', note);
  } else if (action === 'fail') {
    setStep(taskOf(state, task), step, 'failed', note);
  } else if (action === 'drop') {
    const current = taskOf(state, task);
    current.steps = current.steps.filter((item) => item.id !== String(step || '').trim());
    refresh(current);
  } else if (action !== 'status') {
    throw new Error('action 必须是 status、plan、complete、fail 或 drop');
  }
  if (action !== 'status' && TASKS.some(([id]) => state.tasks[id].steps.length) && !state.startedAt) {
    state.startedAt = new Date().toISOString();
  }
  saveState(workspace, state);
  return { text: renderStatus(state), file: path.join(checkpointDir(workspace), 'status.md'), state };
}

module.exports = {
  TASKS, loadState, updateCheckpoint, renderStatus, renderBar, renderBars,
};
