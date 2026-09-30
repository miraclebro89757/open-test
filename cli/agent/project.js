'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function projectFile(homeDir) {
  return path.join(homeDir || os.homedir(), '.opentest', 'project.json');
}

function expandPath(input, homeDir = os.homedir()) {
  const text = String(input || '').trim();
  if (!text) return '';
  if (text === '~') return homeDir;
  if (text.startsWith('~/')) return path.join(homeDir, text.slice(2));
  return path.resolve(text);
}

function readProject(homeDir) {
  const file = projectFile(homeDir);
  if (!fs.existsSync(file)) return { current: '', recent: [] };
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    current: saved.current || '',
    recent: Array.isArray(saved.recent) ? saved.recent : [],
  };
}

function setProject(input, homeDir) {
  const current = expandPath(input, homeDir);
  if (!current || !fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
    throw new Error(`项目目录不存在：${current || input}`);
  }
  if (path.basename(current).startsWith('.')) {
    throw new Error('项目目录必须在 Finder 里可见');
  }
  const saved = readProject(homeDir);
  const recent = [current, ...saved.recent.filter((item) => item !== current)].slice(0, 8);
  const dir = path.dirname(projectFile(homeDir));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(projectFile(homeDir), `${JSON.stringify({ current, recent }, null, 2)}\n`);
  return { current, recent };
}

module.exports = { projectFile, expandPath, readProject, setProject };
