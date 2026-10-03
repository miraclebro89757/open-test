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
  const newline = body.startsWith('\n') ? '\n' : '\n\n';
  const rest = body.startsWith('\n') ? body.slice(1) : body;
  return `${newline}- ${name}：${value}\n${rest}`;
}

function applyAutomationTags(markdown, { matchedIds, specPath }) {
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
      body = upsertField(body, '脚本', specPath);
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
  
  console.log(`🎬 Recording with mode: ${mode}`);
  console.log(`   UI Script: ${mode !== 'api-only' ? specFile : 'N/A'}`);
  console.log(`   HAR File: ${mode !== 'ui-only' ? harFile : 'N/A'}`);
  
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
      console.log(`📊 Analyzing HAR file...`);
      
      try {
        // Analyze HAR with AI (if LLM client provided)
        const analysis = await analyzeHAR(harFile, llmClient || createMockLLM());
        
        // Save analysis
        const analysisFile = path.join(dir, `${baseName}.analysis.json`);
        await fs.promises.writeFile(
          analysisFile,
          JSON.stringify(analysis, null, 2),
          'utf8'
        );
        console.log(`   ✓ Analysis saved: ${analysisFile}`);
        
        // Render HAR to pytest script
        console.log(`🎨 Rendering HAR to pytest...`);
        const scripts = await renderHARToPytest(harFile, analysis, {
          testName: `test_${caseId || 'api_scenario'}`,
          includeCleanup: true,
          includeAssertions: true,
        });
        
        // Save pytest script
        await fs.promises.writeFile(apiTestFile, scripts.pytestScript, 'utf8');
        console.log(`   ✓ API test: ${apiTestFile}`);
        
        // Save .env.example
        const envFile = path.join(dir, `${baseName}.env.example`);
        await fs.promises.writeFile(envFile, scripts.envExample, 'utf8');
        console.log(`   ✓ Env template: ${envFile}`);
        
        // Save README
        const readmeFile = path.join(dir, `${baseName}_README.md`);
        await fs.promises.writeFile(readmeFile, scripts.readme, 'utf8');
        console.log(`   ✓ README: ${readmeFile}`);
        
        apiScript = {
          pytestFile: apiTestFile,
          envFile,
          readmeFile,
          analysis,
        };
        
      } catch (error) {
        console.warn(`⚠ HAR processing failed: ${error.message}`);
        console.warn(`   HAR file preserved at: ${harFile}`);
      }
    } else {
      console.warn(`⚠ HAR file not found: ${harFile}`);
      console.warn(`   This may happen if no API calls were captured during recording.`);
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
    const relativeSpec = mode !== 'api-only' ? path.posix.join('automation', specName) : '';
    const relativeApiTest = apiScript ? path.posix.join('automation', apiTestName) : '';
    
    // Update automation tags with both UI and API script paths
    let updatedMarkdown = markdown;
    if (relativeSpec) {
      updatedMarkdown = applyAutomationTags(updatedMarkdown, { matchedIds, specPath: relativeSpec });
    }
    if (relativeApiTest) {
      updatedMarkdown = applyAutomationTags(updatedMarkdown, { matchedIds, specPath: relativeApiTest });
    }
    
    await fs.promises.writeFile(file, updatedMarkdown);
    found.matches.forEach((item) => matches.push({ 
      id: item.id, 
      file: name, 
      uiSpec: relativeSpec,
      apiSpec: relativeApiTest,
    }));
  }
  
  const listed = matches.length ? matches.map((item) => `${item.id} 自动化：是`).join('，') : '没有用例被标为自动化';
  
  // Build result message
  let message = `录制完成（模式：${mode}）\n`;
  if (mode !== 'api-only') {
    message += `  UI 脚本：${specFile}\n`;
  }
  if (apiScript) {
    message += `  API 脚本：${apiScript.pytestFile}\n`;
    message += `  变量提取：${apiScript.analysis.variables.length} 个\n`;
    message += `  请求依赖：${apiScript.analysis.dependencies.length} 条\n`;
  }
  message += `${note}${listed}`;
  
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

/**
 * Create mock LLM client for fallback analysis
 */
function createMockLLM() {
  return {
    chat: async () => {
      throw new Error('LLM not configured, using fallback analysis');
    },
  };
}

module.exports = {
  parseCases,
  recordingPhrases,
  matchRecording,
  applyAutomationTags,
  recordScenario,
};
