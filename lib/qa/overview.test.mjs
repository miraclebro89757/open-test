import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { parseItems, setItemField, upsertField, setItemBody } = await jiti.import("./markdown.ts");
const { readQaOverview } = await jiti.import("./overview.ts");
const { readCases, readTestPoints } = await jiti.import("./assets.ts");

const CASES = `# 功能用例

### TC001 用户登录
- 优先级：高
- 自动化：是
- 脚本：automation/login.spec.ts，automation/test_api_login.py
- 步骤：打开登录页，输入账号密码

### TC002 密码错误
- 优先级：中
- 步骤：输入错误密码
`;

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qa-overview-"));
}

function write(root, relative, text) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test("items are split at headings and carry their fields", () => {
  const items = parseItems(CASES);
  assert.deepEqual(items.map((item) => item.id), ["TC001", "TC002"]);
  assert.equal(items[0].fields["优先级"], "高");
  assert.equal(items[1].fields["自动化"], undefined);
});

test("setting one field leaves the rest of the file untouched", () => {
  const next = setItemField(CASES, "TC002", "状态", "已确认");
  assert.ok(next.includes("### TC002 密码错误\n- 状态：已确认\n- 优先级：中"));
  assert.equal(next.slice(0, CASES.indexOf("### TC002")), CASES.slice(0, CASES.indexOf("### TC002")));
  const again = setItemField(next, "TC002", "状态", "待确认");
  assert.ok(again.includes("- 状态：待确认"));
  assert.ok(!again.includes("已确认"));
  assert.equal(setItemField(CASES, "NOPE", "状态", "x"), null);
  assert.equal(upsertField("\n- 优先级：高\n", "优先级", "低"), "\n- 优先级：低\n");
});

test("replacing a body keeps the neighbours apart", () => {
  const next = setItemBody(CASES, "TC001", "- 优先级：低\n- 步骤：新步骤");
  const items = parseItems(next);
  assert.equal(items.length, 2);
  assert.equal(items[0].fields["步骤"], "新步骤");
  assert.equal(items[1].id, "TC002");
});

test("an empty workspace is all pending", () => {
  const overview = readQaOverview(workspace());
  assert.equal(overview.stages.length, 7);
  assert.ok(overview.stages.every((stage) => stage.status === "pending"));
  assert.equal(overview.currentStage, "analysis");
  assert.equal(overview.counts.cases, 0);
});

test("counts and stages come from the files and the checkpoint", () => {
  const root = workspace();
  write(root, "knowledge/待澄清.md", "x");
  write(root, "graph/graph.json", JSON.stringify({ features: [{}, {}], rules: [{}], relationships: [{}] }));
  write(root, "test-points/登录.md", "### TP001 登录成功\n- 优先级：高\n- 状态：已确认\n\n### TP002 锁定\n- 优先级：中\n");
  write(root, "cases/登录.md", CASES);
  write(root, "automation/login.spec.ts", "");
  write(root, "automation/versions/login.spec.ts.before-1", "");
  write(root, "automation/test_api_login.py", "");
  write(root, "tasks/checkpoint.json", JSON.stringify({
    product: "MyProduct",
    tasks: {
      analysis: { steps: [{ id: "a", status: "done" }] },
      "test-points": { steps: [{ id: "登录", status: "done" }] },
      cases: { steps: [{ id: "登录", status: "done" }, { id: "支付", status: "pending" }] },
    },
  }));
  const overview = readQaOverview(root);
  assert.equal(overview.product, "MyProduct");
  assert.equal(overview.counts.graphNodes, 3);
  assert.equal(overview.counts.points, 2);
  assert.equal(overview.counts.pointsConfirmed, 1);
  assert.equal(overview.counts.cases, 2);
  assert.equal(overview.counts.casesAutomated, 1);
  assert.equal(overview.counts.uiScripts, 1);
  assert.equal(overview.counts.apiScripts, 1);
  const byId = Object.fromEntries(overview.stages.map((stage) => [stage.id, stage]));
  assert.equal(byId.analysis.status, "done");
  assert.equal(byId["test-points"].status, "done");
  assert.equal(byId.cases.status, "in_progress");
  assert.equal(byId.cases.nextStep, "支付");
  assert.equal(byId.record.status, "in_progress", "scripts exist but nothing is registered");
  assert.equal(overview.currentStage, "cases");
});

test("a pass confirmed in the terminal confirms points that have no status field", () => {
  const root = workspace();
  write(root, "test-points/a.md", "### TP001 甲\n- 优先级：高\n");
  assert.equal(readTestPoints(root)[0].items[0].status, "待确认");
  write(root, "tasks/checkpoint.json", JSON.stringify({ tasks: { "test-points": { steps: [{ id: "confirmed", status: "done" }] } } }));
  assert.equal(readTestPoints(root)[0].items[0].status, "已确认");
});

test("cases expose automation state and scripts", () => {
  const root = workspace();
  write(root, "cases/登录.md", CASES);
  const [file] = readCases(root);
  assert.equal(file.items[0].automated, true);
  assert.deepEqual(file.items[0].scripts, ["automation/login.spec.ts", "automation/test_api_login.py"]);
  assert.equal(file.items[1].automated, false);
});

test("confirmed test points finish the stage only when no planned step is left", () => {
  const unplanned = workspace();
  write(unplanned, "test-points/a.md", "### TP001 甲\n- 状态：已确认\n");
  assert.equal(readQaOverview(unplanned).stages[1].status, "done");

  const planned = workspace();
  write(planned, "test-points/a.md", "### TP001 甲\n- 状态：已确认\n");
  write(planned, "tasks/checkpoint.json", JSON.stringify({ tasks: { "test-points": { steps: [{ id: "登录", status: "done" }, { id: "支付", status: "pending" }] } } }));
  const stage = readQaOverview(planned).stages[1];
  assert.equal(stage.status, "in_progress");
  assert.equal(stage.nextStep, "支付");
});
