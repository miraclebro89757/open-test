import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import { createJiti } from "jiti";

const execFileAsync = promisify(execFile);
const jiti = createJiti(import.meta.url);

async function loadSubject() {
  return jiti.import("./native-file-picker.ts");
}

test("offers Finder only to a browser on this Mac", async () => {
  const { nativeFilePickerAvailability } = await loadSubject();

  assert.deepEqual(nativeFilePickerAvailability("127.0.0.1:30141", "darwin"), {
    supported: true,
    reason: null,
  });
  assert.deepEqual(nativeFilePickerAvailability("localhost:30141", "linux"), {
    supported: false,
    reason: "unsupported-platform",
  });
  assert.deepEqual(nativeFilePickerAvailability("192.168.1.20:30141", "darwin"), {
    supported: false,
    reason: "remote",
  });
  assert.deepEqual(nativeFilePickerAvailability(null, "darwin"), {
    supported: false,
    reason: "remote",
  });
});

test("keeps the prompt out of the script and starts at the filesystem root", async () => {
  const { pickerCommand, sanitizePickerPrompt, pickerStartDirectory, PROBE_ENV } = await loadSubject();

  assert.equal(sanitizePickerPrompt("  \n 选择\t文件 "), "选择 文件");
  assert.equal(sanitizePickerPrompt(""), "Choose files to upload");
  assert.equal(pickerStartDirectory(undefined), "/");
  assert.equal(pickerStartDirectory("Users/me"), "/");
  assert.equal(pickerStartDirectory("/no/such/open-test-dir"), "/");

  const command = pickerCommand("UNIQUE_PROMPT_42\n", "/no/such/open-test-dir");
  assert.equal(command.file, "osascript");
  assert.deepEqual(command.args.slice(0, 3), ["-l", "JavaScript", "-e"]);
  assert.equal(command.args[4], "--");
  assert.equal(command.args.at(-2), "UNIQUE_PROMPT_42");
  assert.equal(command.args.at(-1), "/");
  const script = command.args[3];
  assert.equal(script.includes("UNIQUE_PROMPT_42"), false);
  assert.match(script, /canChooseDirectories = false/);
  assert.match(script, /allowsMultipleSelection = true/);
  assert.match(script, new RegExp(PROBE_ENV));
  assert.doesNotMatch(script, /\/Users\//);
});

test("reads selected paths and treats a closed panel as cancel", async () => {
  const { parsePickedPaths, pickFiles } = await loadSubject();

  assert.deepEqual(parsePickedPaths(""), { cancelled: true });
  assert.deepEqual(parsePickedPaths("OK\n/tmp/a.txt\n/tmp/b.txt\n"), { paths: ["/tmp/a.txt", "/tmp/b.txt"] });
  assert.deepEqual(parsePickedPaths("OK\n"), { error: "No file selected" });
  assert.deepEqual(parsePickedPaths("PROBE\n/"), { error: "Unexpected picker result" });

  let calls = 0;
  const picked = await pickFiles({
    platform: "darwin",
    prompt: "选择要上传的文件",
    defaultPath: "/",
    run: async (file, args) => {
      calls += 1;
      assert.equal(file, "osascript");
      assert.equal(args.at(-2), "选择要上传的文件");
      assert.equal(args.at(-1), "/");
      return { stdout: "OK\n/tmp/demo.txt\n" };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(picked, { ok: true, paths: ["/tmp/demo.txt"] });

  const cancelled = await pickFiles({
    platform: "darwin",
    run: async () => ({ stdout: "" }),
  });
  assert.deepEqual(cancelled, { ok: false, reason: "cancelled" });

  const failed = await pickFiles({
    platform: "darwin",
    run: async () => {
      const error = new Error("osascript: boom");
      error.stderr = "osascript: boom";
      throw error;
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "error");
  assert.match(failed.message, /boom/);
});

test("does not launch osascript where Finder is unavailable or the request already ended", async () => {
  const { pickFiles } = await loadSubject();
  let calls = 0;
  const run = async () => {
    calls += 1;
    return { stdout: "" };
  };

  const unsupported = await pickFiles({ platform: "linux", run });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.reason, "unsupported-platform");

  const controller = new AbortController();
  controller.abort();
  const aborted = await pickFiles({ platform: "darwin", signal: controller.signal, run });
  assert.deepEqual(aborted, { ok: false, reason: "cancelled" });
  assert.equal(calls, 0);
});

test("configures the real open panel without showing it", async (t) => {
  if (process.platform !== "darwin") {
    t.skip("Finder picker only exists on macOS");
    return;
  }
  const { pickerCommand, PROBE_ENV } = await loadSubject();
  const command = pickerCommand("选择要上传的文件", "/");
  const { stdout } = await execFileAsync(command.file, command.args, {
    encoding: "utf8",
    timeout: 8000,
    env: { ...process.env, [PROBE_ENV]: "1" },
  });
  assert.equal(stdout.trim(), "PROBE\n/");
});
