'use strict';

const fs = require('fs');
const path = require('path');
const { loadState, renderBar, renderBars } = require('./checkpoint');

const seenSections = new Map();

function sectionSpans(text) {
  const lines = text.split('\n');
  const heads = [];
  lines.forEach((line, index) => {
    const match = /^(#{1,3})\s+(\S.*)$/.exec(line);
    if (match) heads.push({ line: index + 1, title: match[2].trim() });
  });
  return heads.map((head, index) => ({
    title: head.title,
    start: head.line,
    end: heads[index + 1] ? heads[index + 1].line - 1 : lines.length,
  }));
}

function noteDocumentRead(filePath, { offset = 1, limit } = {}, cwd = process.cwd()) {
  const abs = path.resolve(cwd, String(filePath || ''));
  if (!abs.endsWith('.md') || !fs.existsSync(abs)) return null;
  const text = fs.readFileSync(abs, 'utf8');
  const sections = sectionSpans(text);
  const start = Math.max(1, Number(offset) || 1);
  const end = limit ? start + Number(limit) - 1 : Number.POSITIVE_INFINITY;
  if (!sections.length) {
    const total = Math.max(1, text.split('\n').length);
    return {
      done: Math.min(total, end === Number.POSITIVE_INFINITY ? total : end),
      total,
      next: path.basename(abs),
    };
  }
  const seen = seenSections.get(abs) || new Set();
  sections.forEach((section, index) => {
    if (section.start <= end && section.end >= start) seen.add(index);
  });
  seenSections.set(abs, seen);
  const next = sections.find((_, index) => !seen.has(index));
  return { done: seen.size, total: sections.length, next: next ? next.title : '' };
}

function workspaceForFile(filePath, cwd = process.cwd()) {
  const abs = path.resolve(cwd, String(filePath || ''));
  const dir = path.dirname(abs);
  const candidates = [];
  const add = (workspace) => {
    if (workspace && fs.existsSync(path.join(workspace, 'tasks', 'checkpoint.json'))) candidates.push(workspace);
  };
  add(dir);
  add(path.dirname(dir));
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((name) => add(path.join(dir, name)));
  }
  const hit = candidates.find((workspace) => {
    const source = loadState(workspace).sourceFile;
    return source && path.resolve(source) === abs;
  });
  if (hit) return hit;
  return candidates.length === 1 ? candidates[0] : null;
}

function progressLines(state, readProgress, now = Date.now()) {
  const lines = [];
  const analysisPlanned = state && state.tasks.analysis.steps.length > 0;
  if (readProgress && readProgress.total && !analysisPlanned) {
    lines.push(renderBar('读取需求', readProgress.done, readProgress.total, {
      next: readProgress.next ? `正在读取 ${readProgress.next}` : '正在读取',
    }));
  }
  if (state) {
    renderBars(state, now).forEach((line) => {
      if (!line.includes(' 0/0')) lines.push(line);
    });
  }
  if (!lines.length) {
    lines.push(renderBar('任务', 0, 0, { next: readProgress ? '正在读取需求' : '尚未分节' }));
  }
  return lines.slice(0, 8);
}

function resetReadProgress() {
  seenSections.clear();
}

module.exports = {
  noteDocumentRead, workspaceForFile, progressLines, resetReadProgress,
};
