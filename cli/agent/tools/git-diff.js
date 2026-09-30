'use strict';

const fs = require('fs');
const path = require('path');

function gitDiffImpact({ cwd, workspace, execFileSync, readCases }) {
  let porcelain = '';
  try {
    porcelain = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
  } catch (error) {
    return { ok: false, message: '当前目录不是 git 仓库，或 git 不可用。', files: [], cases: [] };
  }
  const files = porcelain.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
  const cases = (readCases || defaultCases)(workspace || cwd);
  const hits = cases.filter((item) => files.some((file) => item.text.includes(path.basename(file))));
  return {
    ok: true,
    files,
    cases: hits.map((item) => item.name),
    message: files.length ? `变更 ${files.length} 个文件，用例命中 ${hits.length} 个。` : '工作区没有未提交变更。',
  };
}

function defaultCases(workspace) {
  const dir = path.join(workspace, 'cases');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.md')).map((name) => ({
    name,
    text: fs.readFileSync(path.join(dir, name), 'utf8'),
  }));
}

module.exports = { gitDiffImpact };
