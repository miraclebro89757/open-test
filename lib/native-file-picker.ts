import { spawn } from "node:child_process";
import fs from "node:fs";
import { isLoopbackHost } from "./open-in-file-manager";

const DEFAULT_PROMPT = "Choose files to upload";
const PROBE_ENV = "OPEN_TEST_NATIVE_PICKER_PROBE";

/**
 * macOS system open panel. Arguments after `--` are the prompt and the
 * starting directory, so the script itself never interpolates user text.
 * A probe environment variable configures the panel and returns before it
 * is shown; production does not set that variable.
 */
export const NATIVE_FILE_PICKER_SCRIPT = String.raw`
function run(argv) {
  ObjC.import("AppKit");
  const panel = $.NSOpenPanel.openPanel;
  panel.canChooseFiles = true;
  panel.canChooseDirectories = false;
  panel.allowsMultipleSelection = true;
  panel.resolvesAliases = true;
  const message = String((argv && argv[0]) || "");
  if (message) panel.message = message;
  panel.directoryURL = $.NSURL.fileURLWithPath(String((argv && argv[1]) || "/"));

  const env = ObjC.deepUnwrap($.NSProcessInfo.processInfo.environment) || {};
  if (env.OPEN_TEST_NATIVE_PICKER_PROBE === "1") {
    return "PROBE\n" + String(ObjC.unwrap(panel.directoryURL.path));
  }

  const app = $.NSApplication.sharedApplication;
  try {
    app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
    app.activateIgnoringOtherApps(true);
  } catch (error) {}

  let response = panel.runModal;
  if (typeof response === "function") response = response.call(panel);
  if (Number(response) !== 1) return "";

  let urls = panel.URLs;
  if (typeof urls === "function") urls = urls.call(panel);
  let count = urls.count;
  if (typeof count === "function") count = count.call(urls);
  const lines = [];
  for (let i = 0; i < Number(count); i += 1) {
    const item = urls.objectAtIndex(i);
    const filePath = item.path;
    lines.push(String(ObjC.unwrap(typeof filePath === "function" ? filePath.call(item) : filePath)));
  }
  return lines.length ? "OK\n" + lines.join("\n") : "";
}
`;

export type NativePickerReason = "remote" | "unsupported-platform" | "cancelled" | "empty" | "error";

export interface CommandResult {
  stdout: string;
  stderr?: string;
}

export type CommandRunner = (
  file: string,
  args: string[],
  options: { signal?: AbortSignal },
) => Promise<CommandResult>;

interface CommandError extends Error {
  stderr?: string;
  killed?: boolean;
}

/** Whether this browser may raise a Finder open panel on the server. */
export function nativeFilePickerAvailability(
  host: string | null | undefined,
  platform: NodeJS.Platform | string = process.platform,
): { supported: boolean; reason: "remote" | "unsupported-platform" | null } {
  if (!isLoopbackHost(host)) return { supported: false, reason: "remote" };
  if (platform !== "darwin") return { supported: false, reason: "unsupported-platform" };
  return { supported: true, reason: null };
}

/** Collapse control characters so a prompt stays one short label. */
export function sanitizePickerPrompt(value: string | undefined): string {
  const cleaned = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || DEFAULT_PROMPT;
}

/** Use a real directory, otherwise the filesystem root. */
export function pickerStartDirectory(directory: string | undefined): string {
  if (!directory || !directory.startsWith("/") || /[\u0000\r\n]/.test(directory)) return "/";
  try {
    if (fs.statSync(directory).isDirectory()) return directory;
  } catch {
    // A missing start folder would make the panel fail closed. Root still opens.
  }
  return "/";
}

export function pickerCommand(prompt: string | undefined, startDirectory: string | undefined): {
  file: string;
  args: string[];
} {
  return {
    file: "osascript",
    args: [
      "-l", "JavaScript",
      "-e", NATIVE_FILE_PICKER_SCRIPT,
      "--",
      sanitizePickerPrompt(prompt),
      pickerStartDirectory(startDirectory),
    ],
  };
}

export function parsePickedPaths(stdout: string): { paths: string[] } | { cancelled: true } | { error: string } {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { cancelled: true };
  if (lines[0] !== "OK") return { error: "Unexpected picker result" };
  const paths = lines.slice(1).map((line) => (line.length > 1 ? line.replace(/\/+$/, "") : line));
  if (paths.length === 0) return { error: "No file selected" };
  return { paths };
}

export type PickFilesResult =
  | { ok: true; paths: string[] }
  | { ok: false; reason: NativePickerReason; message?: string };

const CANCELLED = /-128|User canceled|用户已取消/;

function defaultRun(file: string, args: string[], options: { signal?: AbortSignal }): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const succeed = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const stop = () => {
      child.kill("SIGTERM");
    };

    if (options.signal) {
      if (options.signal.aborted) stop();
      else options.signal.addEventListener("abort", stop, { once: true });
    }

    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        stop();
        fail(new Error("Picker result is too large"));
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.once("error", (error) => {
      if (options.signal) options.signal.removeEventListener("abort", stop);
      fail(error);
    });
    child.once("close", (code, signalName) => {
      if (options.signal) options.signal.removeEventListener("abort", stop);
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (options.signal?.aborted || signalName) {
        const error = new Error("cancelled") as CommandError;
        error.killed = true;
        error.stderr = stderr;
        fail(error);
        return;
      }
      if (code === 0) {
        succeed({ stdout: Buffer.concat(stdoutChunks).toString("utf8"), stderr });
        return;
      }
      const error = new Error(stderr.trim() || `osascript exited ${code ?? "unknown"}`) as CommandError;
      error.stderr = stderr;
      fail(error);
    });
  });
}

/**
 * Show the macOS open panel and return the selected file paths.
 * An empty result is a cancel. The panel starts at `defaultPath` when that
 * directory exists, and at `/` otherwise.
 */
export async function pickFiles({
  prompt,
  defaultPath = "/",
  platform = process.platform,
  signal,
  run = defaultRun,
}: {
  prompt?: string;
  defaultPath?: string;
  platform?: NodeJS.Platform | string;
  signal?: AbortSignal;
  run?: CommandRunner;
} = {}): Promise<PickFilesResult> {
  if (platform !== "darwin") {
    return { ok: false, reason: "unsupported-platform", message: "Finder is only available on macOS" };
  }
  if (signal?.aborted) return { ok: false, reason: "cancelled" };

  const command = pickerCommand(prompt, defaultPath);
  try {
    const { stdout } = await run(command.file, command.args, { signal });
    const parsed = parsePickedPaths(stdout);
    if ("cancelled" in parsed) return { ok: false, reason: "cancelled" };
    if ("error" in parsed) return { ok: false, reason: "error", message: parsed.error };
    return { ok: true, paths: parsed.paths };
  } catch (error) {
    const failure = error as CommandError;
    const stderr = String(failure.stderr || "");
    const message = String(failure.message || "");
    if (failure.killed || signal?.aborted || CANCELLED.test(stderr) || CANCELLED.test(message)) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: false, reason: "error", message: stderr.trim() || message || "Finder could not open" };
  }
}

export { PROBE_ENV };
