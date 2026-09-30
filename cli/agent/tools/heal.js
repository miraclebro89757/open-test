'use strict';

const fs = require('fs');
const path = require('path');
const { resolveInside } = require('./paths');

function pendingPath(specFile) {
  return path.join(path.dirname(specFile), 'versions', 'pending.json');
}

function readPendingList(specFile) {
  const file = pendingPath(specFile);
  if (!fs.existsSync(file)) return [];
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(saved) ? saved : [];
}

function writePendingList(specFile, entries) {
  const file = pendingPath(specFile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`);
}

async function healSelector({
  cwd,
  filePath,
  oldSelector,
  newSelector,
  readFile,
  writeFile,
  now = () => Date.now(),
}) {
  if (!oldSelector || !newSelector) throw new Error('oldSelector and newSelector are required');
  if (oldSelector === newSelector) throw new Error('oldSelector and newSelector are the same');
  const abs = resolveInside(cwd, filePath);
  const content = await readFile(abs, 'utf8');
  if (!content.includes(oldSelector)) {
    return { success: false, changed: false, message: `未找到选择器: ${oldSelector}` };
  }
  const next = content.replaceAll(oldSelector, newSelector);
  const versions = path.join(path.dirname(abs), 'versions');
  const stamp = now();
  const before = path.join(versions, `${path.basename(abs)}.before-${stamp}`);
  const after = path.join(versions, `${path.basename(abs)}.after-${stamp}`);
  fs.mkdirSync(versions, { recursive: true });
  await writeFile(before, content, 'utf8');
  await writeFile(abs, next, 'utf8');
  await writeFile(after, next, 'utf8');
  const entry = { file: abs, before, after, oldSelector, newSelector };
  writePendingList(abs, [...readPendingList(abs), entry]);
  return {
    success: true,
    changed: true,
    before,
    after,
    message: `已自动替换 ${path.basename(abs)}，前后版本在 ${versions}。用 /heal 决定留哪一版。`,
  };
}

function pendingInProject(project) {
  const file = path.join(project, 'automation', 'versions', 'pending.json');
  if (!fs.existsSync(file)) return [];
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(saved) ? saved : [];
}

function keepHealVersion(entry, choice) {
  if (!entry || (choice !== 'before' && choice !== 'after')) {
    throw new Error('要选择保留自愈前或自愈后');
  }
  if (choice === 'before') {
    fs.copyFileSync(entry.before, entry.file);
  }
  const file = pendingPath(entry.file);
  const rest = readPendingList(entry.file).filter((item) => item.before !== entry.before);
  if (rest.length) writePendingList(entry.file, rest);
  else if (fs.existsSync(file)) fs.unlinkSync(file);
  return { file: entry.file, kept: choice };
}

module.exports = { healSelector, pendingInProject, keepHealVersion };
