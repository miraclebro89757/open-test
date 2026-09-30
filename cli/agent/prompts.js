'use strict';

const path = require('path');

const DEFAULT_ANALYSIS_PROMPT = 'prd-analysis-1.0.0';

function bundledPromptsDir() {
  return path.join(__dirname, 'prompts');
}

function analysisPromptFile(version = DEFAULT_ANALYSIS_PROMPT) {
  return path.join(bundledPromptsDir(), `${version}.md`);
}

function userPromptsDir(agentDir) {
  return path.join(agentDir, 'prompts');
}

function isBuiltinAnalysisPrompt(filePath, builtinDir, cwd = process.cwd()) {
  if (!filePath || !builtinDir) return false;
  const target = path.resolve(cwd, String(filePath));
  const root = path.resolve(builtinDir);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

module.exports = {
  DEFAULT_ANALYSIS_PROMPT,
  bundledPromptsDir,
  analysisPromptFile,
  userPromptsDir,
  isBuiltinAnalysisPrompt,
};
