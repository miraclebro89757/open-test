import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { parseJunit, parsePlaywrightReport, selectScripts, startRun, writeReplayProject, ensurePlaywrightShim, listPendingHeals, keepHeal, RunBusyError } = await jiti.import("./runner.ts");
const { listRuns, readRun, latestRunState, renderRunMarkdown, summarize, isRunId, changedLines } = await jiti.import("./runs.ts");
const { readQaOverview } = await jiti.import("./overview.ts");

const ROOT = path.resolve(import.meta.dirname, "../..");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qa-runner-"));
}

function write(root, relative, text) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

async function finished(root, id) {
  for (let i = 0; i < 200; i += 1) {
    const run = readRun(root, id);
    if (run?.status === "done") return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("run did not finish");
}

test("junit output becomes one result per test", () => {
  const xml = `<testsuites><testsuite><testcase classname="a" name="test_ok" time="0.5"/>
<testcase classname="a" name="test_bad" time="0.1"><failure message="assert 1 == 2">E assert 1 == 2 &amp; more</failure></testcase>
<testcase classname="a" name="test_skip" time="0"><skipped message="no env"/></testcase></testsuite></testsuites>`;
  const tests = parseJunit(xml);
  assert.deepEqual(tests.map((item) => [item.name, item.status]), [["test_ok", "passed"], ["test_bad", "failed"], ["test_skip", "skipped"]]);
  assert.equal(tests[0].durationMs, 500);
  assert.match(tests[1].message, /1 == 2 & more/);
});

test("a playwright json report is read from nested suites and ansi is dropped", () => {
  const report = {
    suites: [{ specs: [], suites: [{ specs: [
      { title: "ok", tests: [{ status: "expected", results: [{ status: "passed", duration: 12 }] }] },
      { title: "bad", tests: [{ status: "unexpected", results: [{ status: "failed", duration: 3, error: { message: "\u001b[31mexpected\u001b[39m 3" } }] }] },
    ] }] }],
  };
  const parsed = parsePlaywrightReport(JSON.stringify(report));
  assert.deepEqual(parsed.tests.map((item) => item.status), ["passed", "failed"]);
  assert.equal(parsed.tests[1].message, "expected 3");
  assert.equal(parsePlaywrightReport("not json"), null);
});

test("only scripts under automation can be run", () => {
  const root = workspace();
  write(root, "automation/a.spec.ts", "");
  write(root, "automation/test_api_a.py", "");
  assert.equal(selectScripts(root, {}).length, 2);
  assert.deepEqual(selectScripts(root, { kind: "api" }).map((item) => item.file), ["automation/test_api_a.py"]);
  assert.throws(() => selectScripts(root, { files: ["../evil.sh"] }), /automation/);
  assert.throws(() => startRun(workspace(), {}), /No case to run/);
  write(root, "recordings/ui-1/capture.json", JSON.stringify({
    capture_id: "ui-1",
    kind: "ui",
    caseId: "TC099",
    title: "新建自定义工种",
    actions: ["await page1.getByRole('button', { name: '登录' }).click();"],
    sandboxUrl: "https://sandbox.example/login",
    pageUrl: "https://sandbox.example/app",
  }));
  assert.deepEqual(selectScripts(root, { files: ["recordings/ui-1/capture.json", "automation/test_api_a.py"] }).map((item) => item.caseId), ["TC099", ""]);
  assert.deepEqual(selectScripts(root, { kind: "ui" }).map((item) => item.file), ["recordings/ui-1/capture.json", "automation/a.spec.ts"]);
});

test("a UI capture is replayed from its own project so Playwright can see the spec", () => {
  const root = workspace();
  write(root, "recordings/ui-1/capture.json", JSON.stringify({
    capture_id: "ui-1",
    kind: "ui",
    caseId: "TC099",
    title: "新建自定义工种",
    sandboxUrl: "https://sandbox.example/login",
    pageUrl: "https://sandbox.example/app",
    actions: ["await page1.getByRole('button', { name: '登录' }).click();"],
  }));
  const project = writeReplayProject(root, "recordings/ui-1/capture.json", false);
  try {
    const cli = path.join(ROOT, "node_modules", "playwright", "cli.js");
    const listed = spawnSync(process.execPath, [cli, "test", "--config", project.config, "--list"], {
      cwd: project.dir,
      encoding: "utf8",
      env: { ...process.env, CI: "1", FORCE_COLOR: "0", NODE_PATH: ensurePlaywrightShim(ROOT) },
    });
    assert.equal(listed.status, 0, listed.stderr || listed.stdout);
    assert.match(listed.stdout, /TC099 新建自定义工种/);
  } finally {
    fs.rmSync(project.dir, { recursive: true, force: true });
  }
});

test("a run executes scripts, records pass and fail, and drives the run stage", async () => {
  const root = workspace();
  write(root, "automation/ping.spec.ts", `import { test, expect } from '@playwright/test';
test('adds', async () => { expect(1 + 1).toBe(2); });
test('breaks', async () => { expect(1 + 1).toBe(3); });
`);
  write(root, "cases/login.md", "### TC001 登录\n- 脚本：automation/ping.spec.ts\n");
  const started = startRun(root, {}, ROOT);
  assert.equal(started.status, "running");
  assert.ok(isRunId(started.id));
  assert.equal(latestRunState(root), "running");
  assert.throws(() => startRun(root, {}, ROOT), RunBusyError);

  const run = await finished(root, started.id);
  assert.deepEqual({ ...run.summary }, { passed: 1, failed: 1, skipped: 0, errors: 0 });
  assert.equal(run.scripts[0].status, "failed");
  assert.deepEqual(run.scripts[0].caseIds, ["TC001"]);
  assert.equal(latestRunState(root), "failed");
  assert.equal(listRuns(root).length, 1);
  assert.ok(fs.existsSync(path.join(root, "reports", "runs", `${run.id}.md`)));
  assert.match(renderRunMarkdown(run), /通过 1，失败 1/);

  const overview = readQaOverview(root);
  assert.equal(overview.stages.find((stage) => stage.id === "run").status, "failed");
  // A run record is a result, not a report.
  assert.equal(overview.counts.reports, 0);
  assert.equal(overview.stages.find((stage) => stage.id === "report").status, "pending");
});

test("an api script without pytest or python is reported as unable to run, not as a failure", async () => {
  const root = workspace();
  write(root, "automation/test_api_x.py", "def test_x():\n    assert True\n");
  const started = startRun(root, {}, ROOT);
  const run = await finished(root, started.id);
  const script = run.scripts[0];
  // pytest may or may not exist on the machine running the tests; both outcomes must be explicit.
  assert.ok(["passed", "error"].includes(script.status), script.status);
  if (script.status === "error") assert.match(script.error, /pytest/);
  assert.equal(summarize([script]).failed, 0);
});

test("pending heals are found in sub-folders and can be kept either way", () => {
  const root = workspace();
  const spec = path.join(root, "automation", "shop", "cart.spec.ts");
  const before = path.join(root, "automation", "shop", "versions", "cart.spec.ts.before-1");
  const after = path.join(root, "automation", "shop", "versions", "cart.spec.ts.after-1");
  write(root, "automation/shop/cart.spec.ts", "page.click('#new')\n");
  write(root, "automation/shop/versions/cart.spec.ts.before-1", "page.click('#old')\n");
  write(root, "automation/shop/versions/cart.spec.ts.after-1", "page.click('#new')\n");
  write(root, "automation/shop/versions/pending.json", JSON.stringify([{ file: spec, before, after, oldSelector: "#old", newSelector: "#new" }]));

  const entries = listPendingHeals(root);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].relativeFile, path.join("automation", "shop", "cart.spec.ts"));

  keepHeal(root, before, "before");
  assert.equal(fs.readFileSync(spec, "utf8"), "page.click('#old')\n");
  assert.equal(listPendingHeals(root).length, 0);
  assert.throws(() => keepHeal(root, before, "before"), /already decided/);
});

test("a pending entry that points outside automation is refused", () => {
  const root = workspace();
  const outside = path.join(root, "secret.txt");
  write(root, "secret.txt", "keep me");
  write(root, "automation/versions/pending.json", JSON.stringify([{ file: outside, before: outside, after: outside, oldSelector: "a", newSelector: "b" }]));
  assert.throws(() => keepHeal(root, outside, "before"), /automation/);
  assert.equal(fs.readFileSync(outside, "utf8"), "keep me");
});

test("a heal shows only the lines that changed", () => {
  assert.deepEqual(changedLines("a\nb\nc", "a\nB\nc"), [{ line: 2, before: "b", after: "B" }]);
  assert.deepEqual(changedLines("same", "same"), []);
});
