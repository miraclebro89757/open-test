'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const TOOLS = [
  'read', 'grep', 'find', 'ls', 'write', 'edit',
  'run_playwright_test', 'heal_selector', 'fetch_zentao_jira',
  'write_executive_report', 'sign_release', 'git_diff_impact',
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

function piHome(homeDir = os.homedir()) {
  return path.join(homeDir, '.opentest', 'pi-agent');
}

function piBin(root = packageRoot()) {
  return path.join(root, 'node_modules', '.bin', 'pi');
}

function providerId(baseUrl) {
  let host = '';
  try {
    host = new URL(baseUrl).host;
  } catch {
    host = '';
  }
  if (host === 'openrouter.ai') return 'openrouter';
  if (host === 'api.deepseek.com') return 'deepseek';
  if (host === 'api.ccswitch.com') return 'cc-switch';
  return 'opentest';
}

function modelsDocument(config) {
  const apiKey = config.provider === 'ollama' ? 'ollama' : '$OPENTEST_API_KEY';
  return {
    providers: {
      [providerId(config.baseUrl)]: {
        baseUrl: config.baseUrl,
        api: 'openai-completions',
        apiKey,
        models: [{ id: config.model }],
      },
    },
  };
}

function writePiHome(config, dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'models.json');
  const body = `${JSON.stringify(modelsDocument(config), null, 2)}\n`;
  fs.writeFileSync(file, body, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows and some mounts ignore chmod.
  }
  return file;
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

function buildPiArgs({ config, words, print, skill, extension, prompt }) {
  const args = [
    '--provider', providerId(config.baseUrl),
    '--model', config.model,
    '--tools', TOOLS,
    '--no-extensions',
    '--extension', extension,
    '--no-skills',
    '--skill', skill,
    '--no-prompt-templates',
    '--no-context-files',
    '--no-approve',
    '--append-system-prompt', prompt,
  ];
  if (print) args.push('--print');
  args.push(...words);
  return args;
}

function assertNoSecret(args, apiKey) {
  if (!apiKey || apiKey === 'ollama-no-key-required') return;
  if (args.some((arg) => String(arg).includes(apiKey))) {
    throw new Error('refusing to put the API key on the process command line');
  }
}

function launchAgent({
  config,
  words = [],
  print = false,
  cwd = process.cwd(),
  env = process.env,
  homeDir,
  spawnImpl = spawn,
  exists = fs.existsSync,
} = {}) {
  const home = piHome(homeDir);
  writePiHome(config, home);
  const prompt = fs.readFileSync(systemPromptPath(), 'utf8').trim();
  const skill = skillDir();
  const extension = extensionPath();
  const tmpDir = path.join(os.tmpdir(), 'opentest-docs');
  const expanded = expandAttachments(words, { cwd, tmpDir });
  const args = buildPiArgs({ config, words: expanded, print, skill, extension, prompt });
  assertNoSecret(args, config.apiKey);
  const bin = piBin();
  if (!exists(bin)) {
    throw new Error('Pi is not installed. From the open-test directory run: npm install');
  }
  const childEnv = {
    ...env,
    PI_CODING_AGENT_DIR: home,
    PI_SKIP_VERSION_CHECK: '1',
    PI_TELEMETRY: '0',
  };
  if (config.provider !== 'ollama') childEnv.OPENTEST_API_KEY = config.apiKey;
  return spawnImpl(bin, args, { cwd, env: childEnv, stdio: 'inherit' });
}

module.exports = {
  TOOLS,
  providerId,
  modelsDocument,
  writePiHome,
  expandAttachments,
  buildPiArgs,
  launchAgent,
  piHome,
  piBin,
  skillDir,
  extensionPath,
};
