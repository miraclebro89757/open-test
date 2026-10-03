'use strict';

const fs = require('fs');
const path = require('path');
const { playwrightInvoke } = require('./playwright-cli');
const { analyzeHAR } = require('./har-analyzer');
const { renderHARToPytest } = require('./har-renderer');

function parseCases(markdown) {
  const matches = [...String(markdown || '').matchAll(/^###\s+(\S+)\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index;
    const headingEnd = start + match[0].length;
    const end = matches[index + 1] ? matches[index + 1].index : markdown.length;
    return {
      id: match[1],
      title: match[2].trim(),
      start,
      headingEnd,
      end,
      body: markdown.slice(headingEnd, end),
    };
  });
}

function quotedPhrases(text) {
  return [...String(text || '').matchAll(/[【「]([^【】「」]{2,40})[】」]/g)].map((match) => match[1]);
}

function recordingPhrases(spec) {
  const patterns = [
    /name:\s*['"]([^'"]+)['"]/g,
    /getBy(?:Text|Placeholder|Label|Title)\(\s*['"]([^'"]+)['"]/g,
  ];
  const found = [];
  patterns.forEach((pattern) => {
    [...String(spec || '').matchAll(pattern)].forEach((match) => {
      const text = match[1].trim();
      if (text.length >= 2) found.push(text);
    });
  });
  return [...new Set(found)];
}

function scoreCase(item, phrases) {
  const haystack = `${item.title}\n${item.body}`;
  return phrases.filter((phrase) => haystack.includes(phrase)).length;
}

function matchRecording(cases, phrases, caseId) {
  if (caseId) {
    const chosen = cases.find((item) => item.id === caseId);
    if (!chosen) return { matches: [], message: `没有找到用例 ${caseId}` };
    return { matches: [chosen], message: `${chosen.id} 按指定用例对照。` };
  }
  const ranked = cases
    .map((item) => ({ item, score: scoreCase(item, phrases) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  if (!ranked.length) return { matches: [], message: '录制内容没有对上任何功能用例。' };
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    return { matches: [], message: '多个用例文案相同，请指定用例编号再录一次。' };
  }
  return { matches: [ranked[0].item], message: `${ranked[0].item.id} 已对照到录制。` };
}

function upsertField(body, name, value) {
  const pattern = new RegExp(`^- ${name}：.*$`, 'm');
  if (pattern.test(body)) return body.replace(pattern, `- ${name}：${value}`);
  const prefix = body.startsWith('\n') ? '\n' : '';
  const rest = body.startsWith('\n') ? body.slice(1) : body;
  return `${prefix}- ${name}：${value}\n${rest}`;
}

function applyAutomationTags(markdown, { matchedIds, specPaths }) {
  const paths = (Array.isArray(specPaths) ? specPaths : [specPaths]).filter(Boolean);
  const cases = parseCases(markdown);
  if (!cases.length) return markdown;
  let cursor = 0;
  let output = '';
  cases.forEach((item) => {
    output += markdown.slice(cursor, item.headingEnd);
    const matched = matchedIds.has(item.id);
    const hasTag = /^- 自动化：/m.test(item.body);
    let body = item.body;
    if (matched) {
      body = upsertField(body, '自动化', '是');
      if (paths.length) body = upsertField(body, '脚本', paths.join('，'));
    } else if (!hasTag) {
      body = upsertField(body, '自动化', '否');
    }
    output += body;
    cursor = item.end;
  });
  output += markdown.slice(cursor);
  return output;
}

function assertSandboxUrl(sandboxUrl) {
  let url;
  try {
    url = new URL(sandboxUrl);
  } catch {
    throw new Error('沙箱地址必须是 http 或 https');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('沙箱地址必须是 http 或 https');
  }
  return url.href;
}

async function recordScenario({
  workspace,
  sandboxUrl,
  caseId,
  confirm,
  execFile,
  mode = 'ui+api', // 'ui+api', 'ui-only', 'api-only'
  llmClient = null,
  now = () => Date.now(),
}) {
  const url = assertSandboxUrl(sandboxUrl);
  
  // Validate recording mode
  const validModes = ['ui+api', 'ui-only', 'api-only'];
  if (!validModes.includes(mode)) {
    throw new Error(`Invalid recording mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
  }
  
  const modeDesc = {
    'ui+api': '同时录制 UI 脚本（Playwright）和 API 脚本（HAR）',
    'ui-only': '仅录制 UI 脚本（Playwright）',
    'api-only': '仅录制 API 请求（HAR）',
  }[mode];
  
  const allowed = await confirm(
    `沙箱 ${url}\n录制模式：${modeDesc}\n请按功能用例操作。关闭录制窗口后，会把脚本对上用例并标记是否自动化。`
  );
  if (!allowed) return { recorded: false, matches: [], message: '未打开沙箱，没有录制。' };
  
  const dir = path.join(workspace, 'automation');
  await fs.promises.mkdir(dir, { recursive: true });
  const timestamp = now();
  const baseName = `${caseId || 'record'}-${timestamp}`;
  
  // Prepare file paths
  const specName = `${baseName}.spec.ts`;
  const specFile = path.join(dir, specName);
  const harName = `${baseName}.har`;
  const harFile = path.join(dir, harName);
  const apiTestName = `test_api_${baseName}.py`;
  const apiTestFile = path.join(dir, apiTestName);
  
  // Build Playwright codegen command with HAR recording
  const codegenArgs = ['codegen', '--target', 'javascript', '-o', specFile];
  
  // Add HAR recording flags if mode requires API capture
  if (mode === 'ui+api' || mode === 'api-only') {
    codegenArgs.push('--save-har', harFile);
    // Only record relevant API calls (exclude static assets)
    codegenArgs.push('--save-har-glob', '**/api/**');
  }
  
  codegenArgs.push(url);
  
  const command = playwrightInvoke(codegenArgs);
  
  // Progress is collected and returned in `message`; this library never prints,
  // so the terminal UI stays in charge and tests are not corrupted by stdout.
  const steps = [`录制模式：${mode}`];
  
  // Execute recording
  await execFile(command.file, command.args, {
    cwd: workspace,
    timeout: 15 * 60 * 1000,
  });
  
  let spec = '';
  let apiScript = null;
  
  // Process UI script (for ui+api and ui-only modes)
  if (mode !== 'api-only') {
    spec = await fs.promises.readFile(specFile, 'utf8');
  } else {
    // For api-only, delete the empty UI script
    if (fs.existsSync(specFile)) {
      await fs.promises.unlink(specFile);
    }
  }
  
  // Process HAR file (for ui+api and api-only modes)
  if (mode !== 'ui-only') {
    if (fs.existsSync(harFile)) {
      steps.push('正在分析 HAR');
      
      try {
        // Analyze HAR with the resolved LLM client; falls back to rules when none.
        const analysis = await analyzeHAR(harFile, llmClient);
        
        // Save analysis
        const analysisFile = path.join(dir, `${baseName}.analysis.json`);
        await fs.promises.writeFile(
          analysisFile,
          JSON.stringify(analysis, null, 2),
          'utf8'
        );
        const source = analysis.source === 'ai' ? 'AI' : '规则引擎';
        steps.push(`分析完成（${source}）：${path.basename(analysisFile)}`);
        
        // Render HAR to pytest script
        steps.push('正在生成 pytest 脚本');
        const scripts = await renderHARToPytest(harFile, analysis, {
          testName: `test_${caseId || 'api_scenario'}`,
          includeCleanup: true,
          includeAssertions: true,
        });
        
        // Save pytest script
        await fs.promises.writeFile(apiTestFile, scripts.pytestScript, 'utf8');
        steps.push(`API 脚本：${path.basename(apiTestFile)}`);
        
        // Save .env.example
        const envFile = path.join(dir, `${baseName}.env.example`);
        await fs.promises.writeFile(envFile, scripts.envExample, 'utf8');
        
        // Save README
        const readmeFile = path.join(dir, `${baseName}_README.md`);
        await fs.promises.writeFile(readmeFile, scripts.readme, 'utf8');
        
        apiScript = {
          pytestFile: apiTestFile,
          envFile,
          readmeFile,
          analysis,
        };
        
      } catch (error) {
        steps.push(`⚠ HAR 处理失败：${error.message}`);
        steps.push(`HAR 原件已保留：${harFile}`);
      }
    } else {
      steps.push(`⚠ 没有找到 HAR：${path.basename(harFile)}，录制期间可能没有捕获到 API 请求。`);
    }
  }
  
  // Match recording to test cases
  const phrases = spec ? recordingPhrases(spec) : [];
  const casesDir = path.join(workspace, 'cases');
  const files = fs.existsSync(casesDir)
    ? (await fs.promises.readdir(casesDir)).filter((name) => name.endsWith('.md'))
    : [];
  const matches = [];
  let note = '没有功能用例文件。';
  
  for (const name of files) {
    const file = path.join(casesDir, name);
    const markdown = await fs.promises.readFile(file, 'utf8');
    const found = matchRecording(parseCases(markdown), phrases, caseId);
    note = found.message;
    const matchedIds = new Set(found.matches.map((item) => item.id));
    const scriptPaths = [
      mode !== 'api-only' ? path.posix.join('automation', specName) : '',
      apiScript ? path.posix.join('automation', apiTestName) : '',
    ].filter(Boolean);

    const updatedMarkdown = applyAutomationTags(markdown, { matchedIds, specPaths: scriptPaths });

    await fs.promises.writeFile(file, updatedMarkdown);
    found.matches.forEach((item) => matches.push({ 
      id: item.id, 
      file: name, 
      uiSpec: mode !== 'api-only' ? path.posix.join('automation', specName) : '',
      apiSpec: apiScript ? path.posix.join('automation', apiTestName) : '',
    }));
  }
  
  const listed = matches.length ? matches.map((item) => `${item.id} 自动化：是`).join('，') : '没有用例被标为自动化';
  
  // Build result message
  const lines = [`录制完成（模式：${mode}）`];
  steps.forEach((step) => lines.push(`  ${step}`));
  if (mode !== 'api-only') {
    lines.push(`  UI 脚本：${specFile}`);
  }
  if (apiScript) {
    lines.push(`  API 脚本：${apiScript.pytestFile}`);
    lines.push(`  变量提取：${apiScript.analysis.variables.length} 个`);
    lines.push(`  请求依赖：${apiScript.analysis.dependencies.length} 条`);
  }
  lines.push(`${note}${listed}`);
  const message = lines.join('\n');

  return {
    recorded: true,
    mode,
    specFile: mode !== 'api-only' ? specFile : null,
    harFile: mode !== 'ui-only' ? harFile : null,
    apiScript,
    matches,
    message,
  };
}

module.exports = {
  parseCases,
  recordingPhrases,
  matchRecording,
  applyAutomationTags,
  recordScenario,
};
