'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function readServers(file) {
  if (!file || !fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && parsed.mcpServers && typeof parsed.mcpServers === 'object' ? parsed.mcpServers : {};
  } catch {
    return {};
  }
}

/** Jira, Zentao, and other issue trackers. DingTalk document and sheet servers are not trackers. */
function trackerKind(name, entry) {
  const label = String(name || '');
  const args = Array.isArray(entry.args) ? entry.args.join(' ') : '';
  const vendor = `${label} ${entry.command || ''} ${args} ${typeof entry.url === 'string' ? entry.url : ''}`;
  if (/钉钉|dingtalk/i.test(vendor) && !/jira|zentao|禅道|atlassian/i.test(label)) return '';
  if (/zentao|chandao|禅道/i.test(vendor)) return 'zentao';
  if (/jira|atlassian/i.test(vendor)) return 'jira';
  if (/youtrack|linear|bugzilla|redmine|tapd|azure-devops|azuredevops|pingcode|teambition/i.test(vendor)) return 'tracker';
  if (/缺陷|bug|issue/i.test(label)) return 'tracker';
  return '';
}

/**
 * Bug-tracker MCP servers from Pi's mcp.json. Names and kinds only.
 * A URL or command can hold a token, so neither is returned.
 */
function listTrackers({ env = process.env, workspace = '' } = {}) {
  const home = env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), '.pi', 'agent');
  const merged = { ...readServers(path.join(home, 'mcp.json')) };
  if (workspace) Object.assign(merged, readServers(path.join(workspace, '.pi', 'mcp.json')));
  const trackers = [];
  for (const [name, entry] of Object.entries(merged)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const kind = trackerKind(name, entry);
    if (!kind) continue;
    trackers.push({ name, kind, enabled: entry.enabled !== false });
  }
  return trackers;
}

function normalizeBugs(bugs) {
  if (!Array.isArray(bugs)) throw new Error('bugs must be a list read from the bug tracker MCP');
  return bugs.slice(0, 100).map((bug) => {
    if (!bug || typeof bug !== 'object') throw new Error('Each defect needs an id and a title');
    const id = String(bug.id || bug.key || '').trim();
    const title = String(bug.title || bug.summary || '').trim();
    if (!id || !title) throw new Error('Each defect needs an id and a title');
    return {
      source: String(bug.source || 'mcp').slice(0, 40),
      id: id.slice(0, 80),
      title: title.slice(0, 300),
      priority: String(bug.priority || '').slice(0, 40),
      status: String(bug.status || '').slice(0, 40),
    };
  });
}

function renderDefects(bugs) {
  if (!bugs.length) return '没有读到缺陷。\n';
  return bugs.map((bug) => `- [${bug.source}] ${bug.id} ${bug.priority} ${bug.status} ${bug.title}`).join('\n') + '\n';
}

/** Write what an MCP read returned. This does not connect to Zentao or Jira. */
function saveDefects(workspace, result, now = () => new Date()) {
  const dir = path.join(workspace, 'defects');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'latest.md'), renderDefects(result.bugs));
  fs.writeFileSync(
    path.join(dir, 'latest.json'),
    `${JSON.stringify({ fetchedAt: now().toISOString(), bugs: result.bugs }, null, 2)}\n`,
  );
}

function recordDefects(workspace, bugs, now = () => new Date()) {
  const normalized = normalizeBugs(bugs);
  saveDefects(workspace, { bugs: normalized }, now);
  return { count: normalized.length, bugs: normalized, message: `写入 ${normalized.length} 条缺陷` };
}

module.exports = { listTrackers, recordDefects, renderDefects, saveDefects, trackerKind };
