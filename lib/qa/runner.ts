import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listAutomationScripts, readCases } from "./assets";
import { loadAgentModule } from "./legacy";
import { opentestRoot } from "./web-session";
import {
  runsDir,
  renderRunMarkdown,
  summarize,
  type RunRecord,
  type RunScript,
  type RunTest,
  type TestStatus,
} from "./runs";

const SCRIPT_TIMEOUT_MS = 5 * 60 * 1000;
const OUTPUT_TAIL = 4000;
const ANSI = /\u001b\[[0-9;]*m/g;

declare global {
  var __opentestActiveRuns: Map<string, string> | undefined;
}

function activeRuns(): Map<string, string> {
  globalThis.__opentestActiveRuns ??= new Map();
  return globalThis.__opentestActiveRuns;
}

export class RunBusyError extends Error {}

function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/**
 * Recorded specs import `@playwright/test`, which this package does not
 * install; `playwright/test` ships inside `playwright`. A one-file shim makes the
 * import resolve for specs that live in a product directory.
 */
export function ensurePlaywrightShim(root: string): string {
  const base = path.join(os.tmpdir(), "opentest-playwright-shim");
  const target = path.join(base, "node_modules", "@playwright", "test");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({ name: "@playwright/test", version: "1.63.0", main: "index.js" }));
  fs.writeFileSync(path.join(target, "index.js"), `module.exports = require(${JSON.stringify(path.join(root, "node_modules", "playwright", "test"))});\n`);
  return path.join(base, "node_modules");
}

interface Exec {
  code: number | null;
  stdout: string;
  stderr: string;
  missing: boolean;
  timedOut: boolean;
}

function execute(file: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }): Promise<Exec> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (result: Exec) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn(file, args, { cwd: options.cwd, env: options.env });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      finish({ code: null, stdout, stderr: error.message, missing: error.code === "ENOENT", timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ code, stdout, stderr, missing: false, timedOut });
    });
  });
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface PlaywrightSuite {
  title?: string;
  specs?: Array<{ title: string; tests: Array<{ status?: string; results: Array<{ status: string; duration: number; error?: { message?: string } }> }> }>;
  suites?: PlaywrightSuite[];
}

export function parsePlaywrightReport(stdout: string): { tests: RunTest[]; errors: string[] } | null {
  let report: { suites?: PlaywrightSuite[]; errors?: Array<{ message?: string }> };
  try {
    report = JSON.parse(stdout);
  } catch {
    return null;
  }
  const tests: RunTest[] = [];
  const walk = (suite: PlaywrightSuite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const last = test.results[test.results.length - 1];
        const status: TestStatus = test.status === "skipped" || last?.status === "skipped"
          ? "skipped"
          : last?.status === "passed" ? "passed" : "failed";
        tests.push({
          name: spec.title,
          status,
          durationMs: Math.round(test.results.reduce((sum, result) => sum + (result.duration ?? 0), 0)),
          message: stripAnsi(last?.error?.message ?? "").trim(),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return { tests, errors: (report.errors ?? []).map((error) => stripAnsi(error.message ?? "").trim()).filter(Boolean) };
}

function decodeXml(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function parseJunit(xml: string): RunTest[] {
  const tests: RunTest[] = [];
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attributes = match[1];
    const inner = match[2] ?? "";
    const name = /\bname="([^"]*)"/.exec(attributes)?.[1] ?? "";
    const time = Number(/\btime="([^"]*)"/.exec(attributes)?.[1] ?? 0);
    const failure = /<(failure|error)\b[^>]*?(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/\1>|<(failure|error)\b[^>]*?message="([^"]*)"[^>]*\/>/.exec(inner);
    const skipped = /<skipped\b/.test(inner);
    const message = failure ? decodeXml((failure[3] || failure[2] || failure[5] || "").trim()) : "";
    tests.push({
      name: decodeXml(name),
      status: failure ? "failed" : skipped ? "skipped" : "passed",
      durationMs: Math.round(time * 1000),
      message,
    });
  }
  return tests;
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

function tail(text: string): string {
  const clean = stripAnsi(text).trim();
  return clean.length > OUTPUT_TAIL ? clean.slice(-OUTPUT_TAIL) : clean;
}

async function runUi(workspace: string, file: string, options: { headed: boolean }, root: string): Promise<Pick<RunScript, "status" | "tests" | "error">> {
  const cli = path.join(root, "node_modules", "playwright", "cli.js");
  if (!fs.existsSync(cli)) {
    return { status: "error", tests: [], error: "Playwright 1.63.0 is not installed. Run npm install in the open-test directory." };
  }
  const args = [cli, "test", path.join(workspace, file), "--reporter=json", ...(options.headed ? ["--headed"] : [])];
  const result = await execute(process.execPath, args, {
    cwd: workspace,
    timeoutMs: SCRIPT_TIMEOUT_MS,
    env: { ...process.env, CI: "1", FORCE_COLOR: "0", NODE_PATH: ensurePlaywrightShim(root), npm_config_yes: "false" },
  });
  if (result.timedOut) return { status: "error", tests: [], error: "Stopped after 5 minutes." };
  const parsed = parsePlaywrightReport(result.stdout);
  if (!parsed) return { status: "error", tests: [], error: tail(result.stderr || result.stdout) || "Playwright did not report a result." };
  if (!parsed.tests.length) {
    return { status: "error", tests: [], error: parsed.errors.join("\n") || "No runnable test was found." };
  }
  const failed = parsed.tests.some((test) => test.status === "failed");
  return {
    status: failed ? "failed" : parsed.tests.every((test) => test.status === "skipped") ? "skipped" : "passed",
    tests: parsed.tests,
    error: failed ? tail(result.stderr) : "",
  };
}

async function runApi(workspace: string, file: string): Promise<Pick<RunScript, "status" | "tests" | "error">> {
  const script = path.join(workspace, file);
  const junit = path.join(os.tmpdir(), `opentest-junit-${process.pid}-${Date.now()}.xml`);
  const args = [script, "-q", "--tb=short", "-p", "no:cacheprovider", `--junitxml=${junit}`];
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1", NO_COLOR: "1" };
  const options = { cwd: path.dirname(script), env, timeoutMs: SCRIPT_TIMEOUT_MS };
  let result = await execute("pytest", args, options);
  if (result.missing) result = await execute("python3", ["-m", "pytest", ...args], options);
  const missingMessage = "pytest is not installed. Run pip install pytest requests python-dotenv and try again.";
  if (result.missing || /No module named pytest/.test(result.stderr)) return { status: "error", tests: [], error: missingMessage };
  if (result.timedOut) return { status: "error", tests: [], error: "Stopped after 5 minutes." };
  let tests: RunTest[] = [];
  try {
    tests = parseJunit(fs.readFileSync(junit, "utf8"));
  } catch {
    // pytest wrote no report: collection failed or it crashed.
  } finally {
    fs.rmSync(junit, { force: true });
  }
  if (!tests.length) return { status: "error", tests: [], error: tail(result.stdout + "\n" + result.stderr) || "pytest did not report a result." };
  const failed = tests.some((test) => test.status === "failed");
  return {
    status: failed ? "failed" : tests.every((test) => test.status === "skipped") ? "skipped" : "passed",
    tests,
    error: failed ? tail(result.stdout) : "",
  };
}

function runId(now = new Date(), workspace = ""): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const base = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  if (!workspace || !fs.existsSync(path.join(runsDir(workspace), `${base}.json`))) return base;
  let suffix = 2;
  while (fs.existsSync(path.join(runsDir(workspace), `${base}-${suffix}.json`))) suffix += 1;
  return `${base}-${suffix}`;
}

function writeRun(workspace: string, run: RunRecord): void {
  fs.mkdirSync(runsDir(workspace), { recursive: true });
  const file = path.join(runsDir(workspace), `${run.id}.json`);
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(run, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

export interface RunRequest {
  /** Relative paths of scripts; omitted means every script of `kind`. */
  files?: string[];
  kind?: "ui" | "api" | "all";
  headed?: boolean;
  retries?: number;
}

/** Pick the scripts a request names, refusing anything that is not a script under automation/. */
export function selectScripts(workspace: string, request: RunRequest): Array<{ file: string; kind: "ui" | "api" }> {
  const known = listAutomationScripts(workspace);
  const kind = request.kind ?? "all";
  const wanted = request.files ? new Set(request.files) : null;
  if (wanted) {
    for (const file of wanted) {
      if (!known.some((script) => script.file === file)) throw new Error(`Not a script under automation/: ${file}`);
    }
  }
  return known.filter((script) => (wanted ? wanted.has(script.file) : kind === "all" || script.kind === kind));
}

/**
 * Start a run in the background and return its record at once. The record is
 * rewritten after every script, so the page can poll reports/runs/<id>.json.
 */
export function startRun(workspace: string, request: RunRequest, root: string = opentestRoot()): RunRecord {
  const scripts = selectScripts(workspace, request);
  if (!scripts.length) throw new Error("No automation script to run. Record one, or ask the agent to generate one.");
  if (activeRuns().has(workspace)) throw new RunBusyError(`Already running ${activeRuns().get(workspace)}. Wait for it to finish.`);

  const caseIdsByScript = new Map<string, string[]>();
  for (const file of readCases(workspace)) {
    for (const item of file.items) {
      for (const script of item.scripts) caseIdsByScript.set(script, [...(caseIdsByScript.get(script) ?? []), item.id]);
    }
  }

  const retries = Math.max(0, Math.min(2, Math.floor(request.retries ?? 0)));
  const run: RunRecord = {
    id: runId(new Date(), workspace),
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    options: { headed: Boolean(request.headed), retries },
    scripts: scripts.map((script) => ({
      file: script.file, kind: script.kind, status: "pending", durationMs: 0, attempts: 0, tests: [], error: "",
      caseIds: caseIdsByScript.get(script.file) ?? [],
    })),
    summary: { passed: 0, failed: 0, skipped: 0, errors: 0 },
  };
  activeRuns().set(workspace, run.id);
  writeRun(workspace, run);

  void (async () => {
    try {
      for (const entry of run.scripts) {
        entry.status = "running";
        writeRun(workspace, run);
        const started = Date.now();
        let outcome: Pick<RunScript, "status" | "tests" | "error">;
        do {
          entry.attempts += 1;
          outcome = entry.kind === "ui"
            ? await runUi(workspace, entry.file, { headed: run.options.headed }, root)
            : await runApi(workspace, entry.file);
        } while ((outcome.status === "failed") && entry.attempts <= retries);
        Object.assign(entry, outcome, { durationMs: Date.now() - started });
        run.summary = summarize(run.scripts);
        writeRun(workspace, run);
      }
    } catch (error) {
      for (const entry of run.scripts) {
        if (entry.status === "pending" || entry.status === "running") {
          entry.status = "error";
          entry.error = error instanceof Error ? error.message : String(error);
        }
      }
    } finally {
      run.status = "done";
      run.finishedAt = new Date().toISOString();
      run.summary = summarize(run.scripts);
      writeRun(workspace, run);
      try {
        fs.writeFileSync(path.join(runsDir(workspace), `${run.id}.md`), renderRunMarkdown(run));
      } catch {
        // The JSON record is the source of truth; the markdown copy is a convenience.
      }
      activeRuns().delete(workspace);
    }
  })();
  return run;
}

// ---------------------------------------------------------------------------
// Self-healing versions
// ---------------------------------------------------------------------------

export interface HealEntry {
  file: string;
  before: string;
  after: string;
  oldSelector: string;
  newSelector: string;
  /** `file` relative to the workspace. */
  relativeFile: string;
}

function findPendingFiles(dir: string, depth = 4): string[] {
  const found: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === "pending.json" && path.basename(dir) === "versions") found.push(full);
    else if (entry.isDirectory() && depth > 0 && !entry.name.startsWith(".") && entry.name !== "node_modules") found.push(...findPendingFiles(full, depth - 1));
  }
  return found;
}

export function listPendingHeals(workspace: string): HealEntry[] {
  const entries: HealEntry[] = [];
  for (const file of findPendingFiles(path.join(workspace, "automation"))) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      if (!Array.isArray(saved)) continue;
      for (const item of saved as Array<Omit<HealEntry, "relativeFile">>) {
        entries.push({ ...item, relativeFile: path.relative(workspace, item.file) });
      }
    } catch {
      // A damaged pending list is skipped rather than blocking the page.
    }
  }
  return entries;
}

/** Keep the healed or the original version, as /heal does in the terminal. */
export function keepHeal(workspace: string, before: string, choice: "before" | "after"): { file: string } {
  const entry = listPendingHeals(workspace).find((item) => item.before === before);
  if (!entry) throw new Error("This healed version was already decided.");
  readVersionText(workspace, entry.file);
  readVersionText(workspace, entry.before);
  const heal = loadAgentModule<{ keepHealVersion: (entry: HealEntry, choice: string) => { file: string } }>("tools/heal.js");
  return heal.keepHealVersion(entry, choice);
}

export function readVersionText(workspace: string, absolute: string): string {
  const root = path.join(path.resolve(workspace), "automation") + path.sep;
  const resolved = path.resolve(absolute);
  if (!resolved.startsWith(root)) throw new Error("The file is not under automation/");
  return fs.readFileSync(resolved, "utf8");
}
