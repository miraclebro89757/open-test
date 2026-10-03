'use strict';

const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// AppleScript reports "user canceled" as error -128. The message text is
// localized ("User canceled." / "用户已取消。"), so match the stable error
// number instead of any English wording.
const CANCELLED = /-128/;

function canPickFolder(platform = os.platform()) {
  return platform === 'darwin';
}

function escapeAppleScript(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/**
 * `POSIX path of` normally omits the trailing slash, but strip defensively
 * while keeping the filesystem root intact.
 */
function normalizePickedPath(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  return text.length > 1 ? text.replace(/\/+$/, '') : text;
}

function buildScript({ title = '选择项目目录', defaultPath = '' } = {}) {
  const prompt = escapeAppleScript(title);
  if (!defaultPath) {
    return [
      `set _picked to choose folder with prompt "${prompt}"`,
      'POSIX path of _picked',
    ].join('\n');
  }
  // A bad default location must not abort the picker, so resolve it defensively.
  return [
    'set _dl to missing value',
    'try',
    `\tset _dl to (POSIX file "${escapeAppleScript(defaultPath)}" as alias)`,
    'end try',
    'if _dl is missing value then',
    `\tset _picked to choose folder with prompt "${prompt}"`,
    'else',
    `\tset _picked to choose folder with prompt "${prompt}" default location _dl`,
    'end if',
    'POSIX path of _picked',
  ].join('\n');
}

/**
 * Show the native macOS folder chooser.
 *
 * Never writes to stdout: the caller (the TUI) owns terminal output.
 *
 * @returns {Promise<{ok: true, path: string} | {ok: false, reason: string, message?: string}>}
 *   reason is one of: unsupported | cancelled | empty | timeout | error
 */
async function pickFolder({
  title = '选择项目目录',
  defaultPath = '',
  timeout = 0,
  platform = os.platform(),
  run = execFileAsync,
} = {}) {
  if (!canPickFolder(platform)) {
    return {
      ok: false,
      reason: 'unsupported',
      message: `当前系统（${platform}）还没有系统文件夹选择器，请手动输入路径`,
    };
  }

  const script = buildScript({ title, defaultPath });

  try {
    const { stdout } = await run('osascript', ['-e', script], {
      encoding: 'utf8',
      timeout: timeout > 0 ? timeout : undefined,
      maxBuffer: 1024 * 1024,
    });
    const picked = normalizePickedPath(stdout);
    if (!picked) {
      return { ok: false, reason: 'empty', message: '没有解析到所选目录' };
    }
    return { ok: true, path: path.resolve(picked) };
  } catch (error) {
    const stderr = String((error && error.stderr) || '');
    const message = String((error && error.message) || '');
    if (error && error.killed) {
      return { ok: false, reason: 'timeout', message: '选择超时，已取消' };
    }
    if (CANCELLED.test(stderr) || CANCELLED.test(message)) {
      return { ok: false, reason: 'cancelled' };
    }
    return {
      ok: false,
      reason: 'error',
      message: stderr.trim() || message || '系统文件夹选择器启动失败',
    };
  }
}

module.exports = {
  pickFolder,
  canPickFolder,
  buildScript,
  normalizePickedPath,
  escapeAppleScript,
};