'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function agentDir(environment = process.env) {
  return environment.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), '.pi', 'agent');
}

function isExcelServerName(name) {
  return /excel|axls|sheet|表格/i.test(name) && !/文档|doc/i.test(name);
}

function readMcpServers(environment = process.env) {
  const file = path.join(agentDir(environment), 'mcp.json');
  if (!fs.existsSync(file)) return {};
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
  return parsed && parsed.mcpServers && typeof parsed.mcpServers === 'object' ? parsed.mcpServers : {};
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function textFromMcp(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (Array.isArray(result.content)) {
    return result.content.map((part) => (part && part.text) || '').join('\n');
  }
  if (typeof result.text === 'string') return result.text;
  if (typeof result.markdown === 'string') return result.markdown;
  return '';
}

module.exports = { agentDir, asObject, isExcelServerName, readMcpServers, textFromMcp };
