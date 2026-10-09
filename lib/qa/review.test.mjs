import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
process.env.OPENTEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { applyPointAction, editItem, ReviewError, resolveReviewFile } = await jiti.import("./review.ts");
const { readTestPoints } = await jiti.import("./assets.ts");
const { readCheckpoint } = await jiti.import("./checkpoint.ts");

const POINTS = `# 登录

### TP001 正确登录
- 优先级：高

### TP002 密码错误
- 优先级：高
- 状态：待确认
`;

function workspace(points = POINTS) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qa-review-"));
  fs.mkdirSync(path.join(root, "test-points"), { recursive: true });
  fs.mkdirSync(path.join(root, "cases"), { recursive: true });
  fs.writeFileSync(path.join(root, "test-points", "登录.md"), points);
  fs.writeFileSync(path.join(root, "cases", "登录.md"), "### TC001 登录\n- 优先级：高\n- 步骤：登录\n");
  return root;
}

const confirmedStep = (root) =>
  (readCheckpoint(root)?.tasks?.["test-points"]?.steps ?? []).some((step) => step.id === "confirmed" && step.status === "done");

test("confirming every point records the confirmed step the terminal waits for", () => {
  const root = workspace();
  let result = applyPointAction(root, "test-points/登录.md", { action: "confirm", ids: ["TP001"] });
  assert.equal(result.changed, 1);
  assert.equal(result.allConfirmed, false);
  assert.equal(confirmedStep(root), false);
  result = applyPointAction(root, "test-points/登录.md", { action: "confirm-all" });
  assert.equal(result.allConfirmed, true);
  assert.equal(confirmedStep(root), true);
  assert.deepEqual(readTestPoints(root)[0].items.map((item) => item.status), ["已确认", "已确认"]);
});

test("reopening a point withdraws the confirmed step", () => {
  const root = workspace();
  applyPointAction(root, "test-points/登录.md", { action: "confirm-all" });
  applyPointAction(root, "test-points/登录.md", { action: "unconfirm", ids: ["TP002"] });
  assert.equal(confirmedStep(root), false);
  assert.deepEqual(readTestPoints(root)[0].items.map((item) => item.status), ["已确认", "待确认"]);
});

test("a pass confirmed in the terminal keeps its other points when one is reopened", () => {
  const root = workspace("### TP001 甲\n- 优先级：高\n\n### TP002 乙\n- 优先级：高\n");
  fs.mkdirSync(path.join(root, "tasks"));
  fs.writeFileSync(path.join(root, "tasks", "checkpoint.json"), JSON.stringify({ tasks: { "test-points": { steps: [{ id: "confirmed", status: "done" }] } } }));
  applyPointAction(root, "test-points/登录.md", { action: "unconfirm", ids: ["TP002"] });
  assert.deepEqual(readTestPoints(root)[0].items.map((item) => item.status), ["已确认", "待确认"]);
});

test("editing a confirmed point reopens it, editing a case does not touch status", () => {
  const root = workspace();
  applyPointAction(root, "test-points/登录.md", { action: "confirm-all" });
  editItem(root, "test-points", "test-points/登录.md", { id: "TP001", title: "正确账号密码登录" });
  const [first, second] = readTestPoints(root)[0].items;
  assert.equal(first.title, "正确账号密码登录");
  assert.equal(first.status, "待确认");
  assert.equal(second.status, "已确认");
  editItem(root, "cases", "cases/登录.md", { id: "TC001", body: "- 优先级：中\n- 步骤：新步骤" });
  const text = fs.readFileSync(path.join(root, "cases", "登录.md"), "utf8");
  assert.match(text, /### TC001 登录\n- 优先级：中\n- 步骤：新步骤/);
});

test("files outside test-points/ and cases/ are refused", () => {
  const root = workspace();
  assert.throws(() => resolveReviewFile(root, "cases", "../outside.md"), ReviewError);
  assert.throws(() => resolveReviewFile(root, "cases", "test-points/登录.md"), ReviewError);
  assert.throws(() => resolveReviewFile(root, "cases", "cases/nope.md"), /not found/);
  assert.throws(() => resolveReviewFile(root, "cases", "cases/登录.txt"), /\.md/);
});
