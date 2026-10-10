import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

async function loadSubject() {
  return jiti.import("./native-upload.ts");
}

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `pi-web-${name}-`));
}

test("copies chosen files into the project and keeps the originals", async (t) => {
  const { runNativeUpload, resetNativeUploadsForTests } = await loadSubject();
  resetNativeUploadsForTests();
  t.after(resetNativeUploadsForTests);
  const project = tempDir("native-copy");
  const outside = tempDir("native-src");
  t.after(() => {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(outside, "clip.txt"), "take one");

  let picks = 0;
  const result = await runNativeUpload({
    host: "127.0.0.1:30141",
    platform: "darwin",
    directory: project,
    body: { prompt: "选择要上传的文件" },
    pick: async (options) => {
      picks += 1;
      assert.equal(options.defaultPath, "/");
      assert.equal(options.prompt, "选择要上传的文件");
      return { ok: true, paths: [path.join(outside, "clip.txt")] };
    },
  });

  assert.equal(picks, 1);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.uploaded, ["clip.txt"]);
  assert.equal(fs.readFileSync(path.join(project, "clip.txt"), "utf8"), "take one");
  assert.equal(fs.readFileSync(path.join(outside, "clip.txt"), "utf8"), "take one");
});

test("asks before replacing a different file, then replaces or skips", async (t) => {
  const { runNativeUpload, resetNativeUploadsForTests } = await loadSubject();
  resetNativeUploadsForTests();
  t.after(resetNativeUploadsForTests);
  const project = tempDir("native-conflict");
  const outside = tempDir("native-conflict-src");
  t.after(() => {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(project, "notes.txt"), "old");
  fs.writeFileSync(path.join(outside, "notes.txt"), "new");
  fs.writeFileSync(path.join(outside, "extra.txt"), "extra");
  fs.mkdirSync(path.join(project, "box"));
  fs.writeFileSync(path.join(outside, "box"), "not-a-folder");

  const picked = [path.join(outside, "notes.txt"), path.join(outside, "extra.txt")];
  const first = await runNativeUpload({
    host: "localhost",
    platform: "darwin",
    directory: project,
    body: {},
    pick: async () => ({ ok: true, paths: picked }),
  });
  assert.equal(first.status, 409);
  assert.deepEqual(first.body.conflicts, ["notes.txt"]);
  assert.equal(fs.existsSync(path.join(project, "extra.txt")), false);

  const skipped = await runNativeUpload({
    host: "localhost",
    directory: project,
    body: { ticket: first.body.ticket, strategy: "skip" },
    pick: async () => {
      throw new Error("Finder should stay closed");
    },
  });
  assert.equal(skipped.status, 200);
  assert.deepEqual(skipped.body.uploaded, ["extra.txt"]);
  assert.deepEqual(skipped.body.skipped, ["notes.txt"]);
  assert.equal(fs.readFileSync(path.join(project, "notes.txt"), "utf8"), "old");

  const again = await runNativeUpload({
    host: "localhost",
    platform: "darwin",
    directory: project,
    body: {},
    pick: async () => ({ ok: true, paths: [path.join(outside, "notes.txt")] }),
  });
  const replaced = await runNativeUpload({
    host: "localhost",
    directory: project,
    body: { ticket: again.body.ticket, strategy: "overwrite" },
  });
  assert.equal(replaced.status, 200);
  assert.equal(fs.readFileSync(path.join(project, "notes.txt"), "utf8"), "new");

  const blocked = await runNativeUpload({
    host: "localhost",
    platform: "darwin",
    directory: project,
    body: {},
    pick: async () => ({ ok: true, paths: [path.join(outside, "box")] }),
  });
  assert.deepEqual(blocked.body.nonReplaceable, ["box"]);
  const refused = await runNativeUpload({
    host: "localhost",
    directory: project,
    body: { ticket: blocked.body.ticket, strategy: "overwrite" },
  });
  assert.equal(refused.status, 207);
  assert.equal(fs.statSync(path.join(project, "box")).isDirectory(), true);
});

test("leaves a file alone when it is already the project file", async (t) => {
  const { runNativeUpload, resetNativeUploadsForTests } = await loadSubject();
  resetNativeUploadsForTests();
  t.after(resetNativeUploadsForTests);
  const project = tempDir("native-same");
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const file = path.join(project, "same.txt");
  fs.writeFileSync(file, "here");

  const result = await runNativeUpload({
    host: "127.0.0.1",
    platform: "darwin",
    directory: project,
    body: {},
    pick: async () => ({ ok: true, paths: [file] }),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.uploaded, []);
  assert.deepEqual(result.body.skipped, ["same.txt"]);
  assert.equal(fs.readFileSync(file, "utf8"), "here");
});

test("refuses folders, duplicate names, remote browsers, and other systems", async (t) => {
  const { runNativeUpload, resetNativeUploadsForTests } = await loadSubject();
  resetNativeUploadsForTests();
  t.after(resetNativeUploadsForTests);
  const project = tempDir("native-refuse");
  const outside = tempDir("native-refuse-src");
  t.after(() => {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(outside, "folder"));
  const nested = path.join(outside, "nested");
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(outside, "a.txt"), "a");
  fs.writeFileSync(path.join(nested, "a.txt"), "b");

  const folder = await runNativeUpload({
    host: "127.0.0.1:30141",
    platform: "darwin",
    directory: project,
    body: {},
    pick: async () => ({ ok: true, paths: [path.join(outside, "folder")] }),
  });
  assert.equal(folder.status, 400);
  assert.equal(folder.body.error, "not-a-file");
  assert.equal(folder.body.detail, "folder");

  const duplicate = await runNativeUpload({
    host: "127.0.0.1:30141",
    platform: "darwin",
    directory: project,
    body: {},
    pick: async () => ({ ok: true, paths: [path.join(outside, "a.txt"), path.join(nested, "a.txt")] }),
  });
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.body.error, /Duplicate/);

  let picks = 0;
  const remote = await runNativeUpload({
    host: "10.0.0.8:30141",
    platform: "darwin",
    directory: project,
    body: {},
    pick: async () => {
      picks += 1;
      return { ok: true, paths: [] };
    },
  });
  const otherSystem = await runNativeUpload({
    host: "127.0.0.1:30141",
    platform: "linux",
    directory: project,
    body: {},
    pick: async () => {
      picks += 1;
      return { ok: true, paths: [] };
    },
  });
  assert.equal(remote.status, 403);
  assert.equal(remote.body.error, "remote");
  assert.equal(otherSystem.status, 403);
  assert.equal(otherSystem.body.error, "unsupported-platform");
  assert.equal(picks, 0);
});

test("a closed panel and a dismissed or expired choice do not copy anything", async (t) => {
  const { runNativeUpload, resetNativeUploadsForTests } = await loadSubject();
  resetNativeUploadsForTests();
  t.after(resetNativeUploadsForTests);
  const project = tempDir("native-cancel");
  const outside = tempDir("native-cancel-src");
  t.after(() => {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(project, "notes.txt"), "old");
  fs.writeFileSync(path.join(outside, "notes.txt"), "new");

  const cancelled = await runNativeUpload({
    host: "127.0.0.1:30141",
    platform: "darwin",
    directory: project,
    body: {},
    pick: async () => ({ ok: false, reason: "cancelled" }),
  });
  assert.deepEqual(cancelled.body, { cancelled: true });
  assert.equal(fs.readFileSync(path.join(project, "notes.txt"), "utf8"), "old");

  const pending = await runNativeUpload({
    host: "127.0.0.1:30141",
    platform: "darwin",
    directory: project,
    body: {},
    now: 1_000,
    pick: async () => ({ ok: true, paths: [path.join(outside, "notes.txt")] }),
  });
  const released = await runNativeUpload({
    host: "127.0.0.1:30141",
    directory: project,
    body: { ticket: pending.body.ticket, release: true },
  });
  assert.equal(released.status, 200);
  const afterRelease = await runNativeUpload({
    host: "127.0.0.1:30141",
    directory: project,
    body: { ticket: pending.body.ticket, strategy: "overwrite" },
  });
  assert.equal(afterRelease.body.error, "upload-expired");

  const expiring = await runNativeUpload({
    host: "127.0.0.1:30141",
    platform: "darwin",
    directory: project,
    body: {},
    now: 5_000,
    pick: async () => ({ ok: true, paths: [path.join(outside, "notes.txt")] }),
  });
  const expired = await runNativeUpload({
    host: "127.0.0.1:30141",
    directory: project,
    body: { ticket: expiring.body.ticket, strategy: "overwrite" },
    now: 5_000 + 10 * 60 * 1000,
  });
  assert.equal(expired.status, 409);
  assert.equal(expired.body.error, "upload-expired");
  assert.equal(fs.readFileSync(path.join(project, "notes.txt"), "utf8"), "old");
});

test("copies the file a symlink points at", async (t) => {
  const { runNativeUpload, resetNativeUploadsForTests } = await loadSubject();
  resetNativeUploadsForTests();
  t.after(resetNativeUploadsForTests);
  const project = tempDir("native-link");
  const outside = tempDir("native-link-src");
  t.after(() => {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  const real = path.join(outside, "real.txt");
  fs.writeFileSync(real, "body");
  const link = path.join(outside, "link.txt");
  try {
    fs.symlinkSync(real, link);
  } catch (error) {
    if (error?.code === "EPERM") {
      t.skip("Creating symbolic links requires additional privileges on this platform");
      return;
    }
    throw error;
  }

  const result = await runNativeUpload({
    host: "127.0.0.1:30141",
    platform: "darwin",
    directory: project,
    body: {},
    pick: async () => ({ ok: true, paths: [link] }),
  });
  assert.equal(result.status, 200);
  const copied = path.join(project, "link.txt");
  assert.equal(fs.lstatSync(copied).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(copied, "utf8"), "body");
});
