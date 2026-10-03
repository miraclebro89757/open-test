'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pickFolder,
  canPickFolder,
  buildScript,
  normalizePickedPath,
  escapeAppleScript,
} = require('./folder-picker');

// Builds a fake execFile-alike that records its call and replays a canned result.
function fakeRun(result = {}) {
  const calls = [];
  const run = async (file, args, options) => {
    calls.push({ file, args, options });
    if (result.throws) throw result.throws;
    return { stdout: result.stdout === undefined ? '' : result.stdout, stderr: result.stderr || '' };
  };
  run.calls = calls;
  return run;
}

test('folder picker is offered on macOS only', () => {
  assert.equal(canPickFolder('darwin'), true);
  assert.equal(canPickFolder('linux'), false);
  assert.equal(canPickFolder('win32'), false);
});

test('picker refuses non-mac platforms without spawning osascript', async () => {
  const run = fakeRun({ stdout: '/tmp/whatever\n' });
  const result = await pickFolder({ platform: 'linux', run });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsupported');
  assert.match(result.message, /linux/);
  assert.equal(run.calls.length, 0, 'osascript must not be called on unsupported platforms');
});

test('picker invokes osascript with the generated script and resolves the path', async () => {
  const run = fakeRun({ stdout: '/Users/me/Projects/webshop/\n' });
  const result = await pickFolder({
    platform: 'darwin',
    run,
    title: '选择项目目录',
    defaultPath: '/Users/me/Projects',
  });

  assert.equal(result.ok, true);
  assert.equal(result.path, '/Users/me/Projects/webshop');
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].file, 'osascript');
  assert.equal(run.calls[0].args[0], '-e');
  const script = run.calls[0].args[1];
  assert.match(script, /^set _dl to missing value/);
  assert.match(script, /choose folder with prompt "选择项目目录"/);
  assert.match(script, /default location _dl/);
  assert.match(script, /POSIX file "\/Users\/me\/Projects" as alias/);
});

test('picker returns a filesystem root unchanged', async () => {
  const run = fakeRun({ stdout: '/\n' });
  const result = await pickFolder({ platform: 'darwin', run });
  assert.equal(result.ok, true);
  assert.equal(result.path, '/');
});

test('picker treats a localized -128 as a user cancel, not a failure', async () => {
  // AppleScript cancels with -128; the message is localized, so only the code is stable.
  const run = fakeRun({
    throws: Object.assign(new Error('Command failed'), {
      stderr: '0:17: execution error: 用户已取消。 (-128)',
      code: 1,
    }),
  });
  const result = await pickFolder({ platform: 'darwin', run });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  assert.equal(result.message, undefined);
});

test('picker also treats an English -128 cancel as a cancel', async () => {
  const run = fakeRun({
    throws: Object.assign(new Error('Command failed'), {
      stderr: 'execution error: User canceled. (-128)',
    }),
  });
  const result = await pickFolder({ platform: 'darwin', run });
  assert.equal(result.reason, 'cancelled');
});

test('picker surfaces real osascript errors instead of swallowing them', async () => {
  const run = fakeRun({
    throws: Object.assign(new Error('Command failed'), {
      stderr: 'osascript: unable to open application',
    }),
  });
  const result = await pickFolder({ platform: 'darwin', run });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'error');
  assert.match(result.message, /unable to open application/);
});

test('picker reports a killed dialog as a timeout, not a cancel', async () => {
  const run = fakeRun({
    throws: Object.assign(new Error('killed'), { killed: true, stderr: '' }),
  });
  const result = await pickFolder({ platform: 'darwin', run, timeout: 10 });
  assert.equal(result.reason, 'timeout');
});

test('picker rejects blank output rather than switching to an empty path', async () => {
  const run = fakeRun({ stdout: '\n  \n' });
  const result = await pickFolder({ platform: 'darwin', run });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty');
});

test('picker forwards the timeout so a stuck dialog cannot hang the TUI', async () => {
  const run = fakeRun({ stdout: '/tmp/x\n' });
  await pickFolder({ platform: 'darwin', run, timeout: 1234 });
  assert.equal(run.calls[0].options.timeout, 1234);
});

test('picker keeps stdout clean so it cannot corrupt the TUI', async () => {
  const log = console.log;
  const printed = [];
  console.log = (...args) => printed.push(args);
  try {
    await pickFolder({ platform: 'darwin', run: fakeRun({ stdout: '/tmp/x\n' }) });
  } finally {
    console.log = log;
  }
  assert.deepEqual(printed, [], 'picker must never write to stdout');
});

test('AppleScript builder escapes quotes so a title cannot break out', () => {
  const script = buildScript({ title: 'say "hi"', defaultPath: '/tmp/a"b' });
  assert.match(script, /prompt "say \\"hi\\""/);
  assert.match(script, /POSIX file "\/tmp\/a\\"b"/);
  assert.match(script, /default location _dl/);
});

test('AppleScript builder omits the default branch when no path is given', () => {
  const script = buildScript({ title: '选目录' });
  assert.equal(script.includes('default location'), false);
  assert.match(script, /choose folder with prompt "选目录"/);
});

test('path normalization strips trailing slashes but never eats the root', () => {
  assert.equal(normalizePickedPath('/a/b/\n'), '/a/b');
  assert.equal(normalizePickedPath('/a/b///'), '/a/b');
  assert.equal(normalizePickedPath('/'), '/');
  assert.equal(normalizePickedPath('   '), '');
  assert.equal(normalizePickedPath(undefined), '');
});

test('AppleScript escaping doubles backslashes', () => {
  assert.equal(escapeAppleScript('a\\b"c'), 'a\\\\b\\"c');
  assert.equal(escapeAppleScript(null), '');
});