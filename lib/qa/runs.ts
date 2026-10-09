import fs from "node:fs";
import path from "node:path";

export type TestStatus = "passed" | "failed" | "skipped";
export type ScriptStatus = TestStatus | "error" | "running" | "pending";

export interface RunTest {
  name: string;
  status: TestStatus;
  durationMs: number;
  message: string;
}

export interface RunScript {
  /** Relative to the workspace. */
  file: string;
  kind: "ui" | "api";
  status: ScriptStatus;
  durationMs: number;
  attempts: number;
  tests: RunTest[];
  /** Why the script could not run, or the tail of its output when it failed. */
  error: string;
  caseIds: string[];
}

export interface RunSummary {
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
}

export interface RunRecord {
  id: string;
  status: "running" | "done";
  startedAt: string;
  finishedAt: string | null;
  options: { headed: boolean; retries: number };
  scripts: RunScript[];
  summary: RunSummary;
}

export function runsDir(workspace: string): string {
  return path.join(workspace, "reports", "runs");
}

export function summarize(scripts: RunScript[]): RunSummary {
  const summary: RunSummary = { passed: 0, failed: 0, skipped: 0, errors: 0 };
  for (const script of scripts) {
    if (script.status === "error") summary.errors += 1;
    for (const test of script.tests) summary[test.status === "passed" ? "passed" : test.status === "failed" ? "failed" : "skipped"] += 1;
  }
  return summary;
}

export function isRunId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{8}-[0-9]{6}(-[0-9]+)?$/.test(value);
}

export function readRun(workspace: string, id: string): RunRecord | null {
  if (!isRunId(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(runsDir(workspace), `${id}.json`), "utf8")) as RunRecord;
  } catch {
    return null;
  }
}

/** Runs, newest first. */
export function listRuns(workspace: string, limit = 20): RunRecord[] {
  let names: string[];
  try {
    names = fs.readdirSync(runsDir(workspace)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  return names
    .sort()
    .reverse()
    .slice(0, limit)
    .map((name) => readRun(workspace, name.slice(0, -5)))
    .filter((run): run is RunRecord => run !== null);
}

export type RunStageState = "none" | "running" | "failed" | "passed";

export function latestRunState(workspace: string): RunStageState {
  const latest = listRuns(workspace, 1)[0];
  if (!latest) return "none";
  if (latest.status === "running") return "running";
  return latest.summary.failed + latest.summary.errors > 0 ? "failed" : "passed";
}

export function renderRunMarkdown(run: RunRecord): string {
  const { summary } = run;
  const lines = [
    `# 执行结果 ${run.id}`,
    "",
    `开始：${run.startedAt}`,
    `结束：${run.finishedAt ?? "进行中"}`,
    `通过 ${summary.passed}，失败 ${summary.failed}，跳过 ${summary.skipped}，无法执行 ${summary.errors}。`,
    "",
    "数字只来自这次实际执行的脚本。",
    "",
    "| 脚本 | 类型 | 结果 | 耗时 | 用例 |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const script of run.scripts) {
    lines.push(`| ${script.file} | ${script.kind === "ui" ? "UI" : "API"} | ${script.status} | ${(script.durationMs / 1000).toFixed(1)}s | ${script.caseIds.join("、") || "-"} |`);
  }
  const failing = run.scripts.filter((script) => script.status === "failed" || script.status === "error");
  if (failing.length) {
    lines.push("", "## 失败详情", "");
    for (const script of failing) {
      lines.push(`### ${script.file}`, "");
      for (const test of script.tests.filter((item) => item.status === "failed")) lines.push(`- ${test.name}：${test.message.split("\n")[0]}`);
      if (script.error) lines.push("", "```", script.error.slice(-1500), "```");
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

/** The lines that differ between the two versions, with a little context. Healing replaces text in place, so lines pair up. */
export function changedLines(before: string, after: string): Array<{ line: number; before: string; after: string }> {
  const left = before.split("\n");
  const right = after.split("\n");
  const changes: Array<{ line: number; before: string; after: string }> = [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? "") !== (right[index] ?? "")) changes.push({ line: index + 1, before: left[index] ?? "", after: right[index] ?? "" });
  }
  return changes;
}
