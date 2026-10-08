'use strict';

const fs = require('fs');
const path = require('path');
const { loadState, updateCheckpoint } = require('./tasks/checkpoint');

const STEPS = [
  ['status', 'ctrl+shift+0', '进度', ['tasks'], '读取任务进度，从失败或未完成的步骤继续。不要重做已完成步骤。'],
  ['analyze', 'ctrl+shift+1', '需求分析', ['knowledge', 'graph'], '只做需求分析，按断点继续。不要写测试点，不要写用例。'],
  ['points', 'ctrl+shift+2', '测试点', ['test-points'], '只根据图谱写测试点。写完停下来等人确认。不要写用例。'],
  ['cases', 'ctrl+shift+3', '功能用例', ['cases'], '测试点已经确认。只写功能用例，新用例的自动化写成否。不要改测试点。'],
  ['explore', 'ctrl+shift+4', '智能探索', ['automation', 'cases'], '启动浏览器让用户操作一遍，Agent 自动分析并生成测试脚本。使用 explore_and_generate 工具。'],
  ['record', 'ctrl+shift+5', '录制', ['automation', 'cases'], '先问沙箱的 http 或 https 地址，再录制并把结果对上功能用例。不要编造地址。'],
  ['run', 'ctrl+shift+6', '跑自动化', ['automation'], '跑当前项目 automation 里的脚本。选择器失败时立刻调用 heal_selector，不要停下来问。跑完不要自己决定留哪一版。'],
  ['heal', 'ctrl+shift+7', '自愈版本', ['automation'], '自愈在跑自动化时已经自动做完。这里只让用户看前后版本并决定留哪一版，不要再改选择器。'],
  ['defects', 'ctrl+shift+8', '缺陷', ['defects'], '读取禅道或 Jira。未配置时说明缺什么，不要编造缺陷。'],
  ['report', 'ctrl+shift+9', '测试简报', ['reports'], '根据已经写好的用例和缺陷写测试简报。不要编造通过率。'],
];

const CHOICES = ['创建新任务', '查看已有文档'];

function stepByName(name) {
  const found = STEPS.find((item) => item[0] === name);
  if (!found) throw new Error(`未知命令 ${name}`);
  return { name: found[0], shortcut: found[1], title: found[2], dirs: found[3], create: found[4] };
}

function listDocs(project, dirs) {
  const lines = [];
  dirs.forEach((dir) => {
    const root = path.join(project, dir);
    if (!fs.existsSync(root)) {
      lines.push(`${dir}/（还没有文件）`);
      return;
    }
    const found = [];
    const stack = [root];
    while (stack.length && found.length < 40) {
      const current = stack.pop();
      fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
        const abs = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(abs);
        else found.push(path.relative(project, abs));
      });
    }
    if (!found.length) lines.push(`${dir}/（还没有文件）`);
    else lines.push(...found);
  });
  return lines;
}

function pointsConfirmed(project) {
  if (!project || !fs.existsSync(path.join(project, 'tasks', 'checkpoint.json'))) return false;
  return loadState(project).tasks['test-points'].steps.some((step) => step.id === 'confirmed' && step.status === 'done');
}

function confirmPoints(project) {
  updateCheckpoint(project, { action: 'complete', task: 'test-points', step: 'confirmed' });
}

function revokePoints(project) {
  if (!pointsConfirmed(project)) return;
  updateCheckpoint(project, { action: 'drop', task: 'test-points', step: 'confirmed' });
}

function prepareStep({ name, choice, project }) {
  const step = stepByName(name);
  if (!project) return { action: 'need-project', step };
  if (choice === '查看已有文档') {
    return { action: 'view', step, files: listDocs(project, step.dirs) };
  }
  if (choice !== '创建新任务') return { action: 'cancel', step };
  if (name === 'cases' && !pointsConfirmed(project)) {
    return { action: 'blocked', step, message: '测试点还没有确认，不能生成用例。先用 /points 查看并确认。' };
  }
  if (name === 'points') revokePoints(project);
  return { action: 'create', step, message: `当前项目 ${project}。${step.create}` };
}

module.exports = {
  STEPS, CHOICES, stepByName, listDocs, pointsConfirmed, confirmPoints, prepareStep,
};
