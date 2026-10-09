'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const {
  DEFAULT_ANALYSIS_PROMPT,
  analysisPromptFile,
  bundledPromptsDir,
  userPromptsDir,
} = require('./prompts');
const { agentDir } = require('./pi-config');

const TOOLS = [
  'read', 'grep', 'find', 'ls', 'write', 'edit',
  'run_playwright_test', 'heal_selector', 'fetch_zentao_jira',
  'write_executive_report',
  'store_requirement_graph', 'query_requirement_graph',
  'record_playwright_scenario', 'task_checkpoint',
].join(',');

function packageRoot() {
  return path.join(__dirname, '..', '..');
}

function skillDir() {
  return path.join(packageRoot(), '.pi', 'skills', 'opentest-qa');
}

function extensionPath() {
  return path.join(__dirname, 'extension.js');
}

function systemPromptPath() {
  return path.join(__dirname, 'system-prompt.md');
}

function piBin(root = packageRoot()) {
  return path.join(root, 'node_modules', '.bin', 'pi');
}

function extractDocx(filePath) {
  const xml = execFileSync('unzip', ['-p', filePath, 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function expandAttachments(words, { cwd, tmpDir, extract = extractDocx, exists = fs.existsSync, write = fs.writeFileSync }) {
  return words.map((word) => {
    if (!word.startsWith('@') || word.length < 2) return word;
    const abs = path.resolve(cwd, word.slice(1));
    if (path.extname(abs).toLowerCase() !== '.docx') return `@${abs}`;
    if (!exists(abs)) return `@${abs}`;
    const text = extract(abs);
    fs.mkdirSync(tmpDir, { recursive: true });
    const out = path.join(tmpDir, `${path.basename(abs, path.extname(abs))}.md`);
    write(out, text);
    return `@${out}`;
  });
}

function composeSystemPrompt(base, { version, promptFile, promptsDir }) {
  return [
    String(base || '').trim(),
    `默认需求分析 prompt 是 /${version}，规则文件 ${promptFile} 只读，不要修改。`,
    `内置需求分析只有 /${version}。自定义模板放在 ${promptsDir}，文件名去掉 .md 就是命令名。与 /${version} 同名不会替换内置模板。`,
  ].filter(Boolean).join('\n');
}

function buildPiArgs({ words, print, skill, extension, prompt, promptTemplate }) {
  // No --provider, --model or --models: Pi starts on the default model chosen
  // in Pi Web's model page and switches with its own /model and Ctrl+P.
  const args = [
    '--tools', TOOLS,
    '--no-extensions',
    '--extension', extension,
    '--no-skills',
    '--skill', skill,
    '--prompt-template', promptTemplate,
    '--no-context-files',
    '--no-approve',
    '--append-system-prompt', prompt,
  ];
  if (print) args.push('--print');
  args.push(...words);
  return args;
}

function launchAgent({
  words = [],
  print = false,
  cwd = process.cwd(),
  env = process.env,
  homeDir,
  spawnImpl = spawn,
  exists = fs.existsSync,
} = {}) {
  const dir = agentDir({ env, homeDir });
  const promptsDir = userPromptsDir(dir);
  fs.mkdirSync(promptsDir, { recursive: true });
  const prompt = composeSystemPrompt(fs.readFileSync(systemPromptPath(), 'utf8'), {
    version: DEFAULT_ANALYSIS_PROMPT,
    promptFile: analysisPromptFile(),
    promptsDir,
  });
  const skill = skillDir();
  const extension = extensionPath();
  const promptTemplate = bundledPromptsDir();
  const tmpDir = path.join(os.tmpdir(), 'opentest-docs');
  const expanded = expandAttachments(words, { cwd, tmpDir });
  const args = buildPiArgs({ words: expanded, print, skill, extension, prompt, promptTemplate });
  const bin = piBin();
  if (!exists(bin)) {
    throw new Error('Pi is not installed. From the open-test directory run: npm install');
  }
  // PI_CODING_AGENT_DIR is passed through only if the user set it. Leaving it
  // alone keeps the terminal on the same directory Pi Web uses.
  const childEnv = {
    ...env,
    PI_SKIP_VERSION_CHECK: '1',
    PI_TELEMETRY: '0',
  };
  return spawnImpl(bin, args, { cwd, env: childEnv, stdio: 'inherit' });
}

module.exports = {
  TOOLS,
  expandAttachments,
  composeSystemPrompt,
  buildPiArgs,
  launchAgent,
  piBin,
  skillDir,
  extensionPath,
};
