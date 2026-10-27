'use strict';

const fs = require('fs');
const path = require('path');

const FIELD_LINE = /^[-*]\s*([^：:\n]{1,12})[：:]\s*(.*)$/;
const TITLE_JOIN = /与|兼测|同时校验/;
const INTENT = /新建|新增|创建|校验|限制|权限|长度|重名|必填|成功|失败/;

function parseNamedFields(body) {
  const fields = {};
  let current = null;
  for (const line of String(body || '').replace(/^\n/, '').split('\n')) {
    const match = FIELD_LINE.exec(line);
    if (match && !/^\s/.test(line)) {
      current = match[1].trim();
      if (!(current in fields)) fields[current] = match[2];
      continue;
    }
    if (!current) continue;
    const extra = line.replace(/^\s{0,4}/, '');
    fields[current] = fields[current] ? `${fields[current]}\n${extra}` : extra;
  }
  return fields;
}

function parseItems(markdown) {
  const text = String(markdown || '');
  const matches = [...text.matchAll(/^###\s+(\S+)\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const headingEnd = start + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const body = text.slice(headingEnd, end);
    return { id: match[1], title: match[2].trim(), body, fields: parseNamedFields(body) };
  });
}

/** Empty when the case asserts one thing. Same rule as lib/qa/case-format.ts. */
function caseAtomicityIssue(title, detail = '') {
  const name = String(title || '').replace(/^#+\s*/, '').replace(/^TC\d+\s+/, '').trim();
  const text = `${name}\n${detail}`;
  if (TITLE_JOIN.test(name)) {
    return `标题「${name}」把多件事连在一起。一条用例只验证一件事，标题不要用「与」「兼测」「同时校验」。`;
  }
  const sides = name.split('和').map((part) => part.trim()).filter(Boolean);
  if (sides.length >= 2 && sides.every((part) => INTENT.test(part))) {
    return `标题「${name}」里的「和」连着两件要分开验证的事。拆成两条用例。`;
  }
  const success = /创建成功|新增成功|保存成功|新建成功/.test(text);
  const negative = /重名|重复|超限|不可输入|失败提示|拦截|必填校验|格式校验/.test(text);
  if (success && negative) {
    return '同一条用例不能既写创建成功，又写重名、长度、格式或必填拦截。拆成两条。';
  }
  const permission = /默认无权限|默认无任何权限|默认权限/.test(text);
  const length = /长度|最大\d+字符|\d+字符|超限/.test(text);
  if (permission && length) {
    return '默认权限和名称长度是两件正交的事，必须拆成两条用例。';
  }
  return '';
}

function stepIssue(fields) {
  const lines = String(fields['步骤'] || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return '步骤要换行编号，写成「- 步骤：」下一行「  1. …」。';
  if (lines.some((line) => /[；;]/.test(line))) return '步骤不要把多步挤在同一行，每一步单独一行编号。';
  if (!lines.every((line) => /^\d+\.\s+\S/.test(line))) return '步骤必须写成「1. …」这种换行编号。';
  return '';
}

function readArtifact(workspace, dir, step) {
  const name = String(step || '').trim();
  const relative = `${dir}/${name}.md`;
  const file = path.join(workspace, relative);
  if (!name || !fs.existsSync(file)) return { relative, markdown: '' };
  return { relative, markdown: fs.readFileSync(file, 'utf8') };
}

function reviewPoints(workspace, step) {
  const { relative, markdown } = readArtifact(workspace, 'test-points', step);
  if (!markdown) return [`没有找到 ${relative}。先写好这一功能的测试点。`];
  const items = parseItems(markdown);
  if (!items.length) return [`${relative} 里没有 ### TP 测试点。`];
  const issues = [];
  for (const item of items) {
    const status = String(item.fields['状态'] || '').trim();
    if (status.startsWith('已确认')) continue;
    if (!String(item.fields['优先级'] || '').trim()) issues.push(`${item.id} 要写优先级。`);
    if (!status.startsWith('待确认')) issues.push(`${item.id} 新测试点要写「- 状态：待确认」。`);
    const atomicity = caseAtomicityIssue(item.title, item.body);
    if (atomicity) issues.push(`${item.id} ${atomicity}`);
  }
  return issues;
}

function reviewCases(workspace, step) {
  const { relative, markdown } = readArtifact(workspace, 'cases', step);
  if (!markdown) return [`没有找到 ${relative}。先写好这一功能的用例。`];
  const items = parseItems(markdown);
  const drafts = items.filter((item) => String(item.fields['状态'] || '').trim().startsWith('待确认'));
  if (!drafts.length) return [];
  const issues = [];
  if (!/^#\s+功能用例-/m.test(markdown)) issues.push(`${relative} 文件头要写成「# 功能用例-<模块>」。`);
  for (const item of drafts) {
    const fields = item.fields;
    if (!String(fields['优先级'] || '').trim()) issues.push(`${item.id} 要写优先级。`);
    const automated = String(fields['自动化'] || '').trim();
    if (automated !== '是' && automated !== '否') issues.push(`${item.id} 自动化要写成是或否。`);
    const recording = String(fields['录制'] || '').trim();
    if (recording !== '需要' && recording !== '不需要') issues.push(`${item.id} 录制要写成需要或不需要。只有高优先级的核心用户旅程写需要。`);
    if (!String(fields['对应测试点'] || '').trim()) issues.push(`${item.id} 要写对应测试点。`);
    if (!String(fields['前置条件'] || '').trim()) issues.push(`${item.id} 要写前置条件。`);
    if (!String(fields['期望结果'] || '').trim()) issues.push(`${item.id} 要写期望结果。`);
    const steps = stepIssue(fields);
    if (steps) issues.push(`${item.id} ${steps}`);
    const atomicity = caseAtomicityIssue(item.title, `${item.title}\n${item.body}`);
    if (atomicity) issues.push(`${item.id} ${atomicity}`);
  }
  return issues;
}

function reviewStepStandards(workspace, task, step) {
  if (task === 'test-points') return reviewPoints(workspace, step);
  if (task === 'cases') return reviewCases(workspace, step);
  return [];
}

function assertStepStandards(workspace, task, step) {
  const issues = reviewStepStandards(workspace, task, step);
  if (!issues.length) return;
  throw new Error([
    'The standard review did not pass. Fix this step’s output, then complete it. Do not start the next step.',
    ...issues.map((item) => `- ${item}`),
  ].join('\n'));
}

module.exports = { reviewStepStandards, assertStepStandards };
