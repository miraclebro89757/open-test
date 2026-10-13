import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

process.env.OPENTEST_LESSONS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "qa-review-lessons-"));

const jiti = createJiti(import.meta.url);
const { readPolicy, writePolicy } = await jiti.import("./policy.ts");
const { stageRequest } = await jiti.import("./client.ts");
const {
  acceptBulk,
  acceptKind,
  applyBaseline,
  blockedFeatureNames,
  decideReview,
  listReviews,
  reviewKinds,
  riskLevel,
} = await jiti.import("./reviews.ts");
const { ReviewError } = await jiti.import("./review.ts");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qa-review-"));
}

function write(root, relative, text) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const CLARIFICATIONS = `# 需求评审

## 待澄清问题

### Q001 活动下线后旧用例怎么处理
- 状态：待处理
- 原文：活动——下线
- Agent理解：旧用例可以废弃
- 补充：

### Q002 订阅消息删除线
- 状态：待处理
- 原文：订阅消息删除线与服务号的关系
- Agent理解：删除线表示文案划掉
- 补充：

### Q003 导出范围
- 状态：已补充
- 原文：支持导出
- Agent理解：导出全部
- 补充：只导出当前项目
`;

test("high-risk phrases stay high risk, including ones that only look similar", () => {
  assert.equal(riskLevel("活动——下线"), "L3");
  assert.equal(riskLevel("隐患处置互相矛盾"), "L3");
  assert.equal(riskLevel("新版未提及这个功能"), "L3");
  assert.equal(riskLevel("没有可执行规则"), "L3");
  assert.equal(riskLevel("订阅消息删除线与服务号的关系"), "L2");
});

test("a missing policy is smart collaboration", () => {
  const root = workspace();
  assert.equal(readPolicy(root).mode, "balanced");
  assert.equal(writePolicy(root, "guided").mode, "guided");
  assert.equal(readPolicy(root).mode, "guided");
  assert.equal(stageRequest("test-points", "guided").text.includes("停下"), true);
  assert.equal(stageRequest("test-points", "balanced").text.includes("不要问要不要继续"), true);
  assert.equal(stageRequest("record", "autonomous").text.includes("沙箱地址"), true);
});

test("bulk accept confirms drafts and leaves deletions for a person", () => {
  const root = workspace();
  write(root, "knowledge/需求评审.md", CLARIFICATIONS);
  write(root, "test-points/巡检.md", "### TP001 打开列表\n- 优先级：高\n- 状态：待确认\n");
  write(root, "test-points/作业.md", "### TP002 已看过\n- 优先级：中\n- 状态：已确认\n");
  write(root, "cases/巡检.md", "### TC001 打开列表\n- 优先级：高\n- 状态：待确认\n- 自动化：否\n- 步骤：打开页面\n- 期望结果：看到列表\n");
  const activity = "### TC-ACT 活动报名\n- 优先级：高\n- 自动化：否\n- 步骤：打开活动\n- 期望结果：看到活动\n";
  write(root, "cases/活动.md", activity);
  write(root, "knowledge/evolution/current.json", JSON.stringify({
    evolution_id: "EVO-1",
    status: "review_required",
    requirement_changes: [{ id: "REQ-1", name: "活动", change_type: "removed", rationale: "活动下线" }],
    test_asset_actions: [{
      asset_id: "TC-ACT",
      title: "活动报名",
      file: "cases/活动.md",
      action: "deprecate",
      requires_review: true,
      reasons: ["关联需求在新版标记下线。废弃要人工确认。"],
      requirement_id: "REQ-1",
    }],
    fingerprints: { "cases/活动.md": createHash("sha256").update(activity).digest("hex") },
  }));

  const items = listReviews(root);
  const removal = items.find((item) => item.itemId === "Q001");
  const strike = items.find((item) => item.itemId === "Q002");
  const deprecate = items.find((item) => item.itemId === "TC-ACT");
  const baseline = items.find((item) => item.source === "baseline");
  assert.equal(removal.level, "L3");
  assert.equal(removal.bulkEligible, false);
  assert.equal(removal.blocking, true);
  assert.equal(strike.level, "L2");
  assert.equal(strike.bulkEligible, true);
  assert.equal(deprecate.level, "L3");
  assert.equal(deprecate.bulkEligible, false);
  assert.equal(baseline.level, "L4");
  assert.equal(baseline.bulkEligible, false);
  assert.deepEqual(blockedFeatureNames(items).includes("活动下线后旧用例怎么处理"), true);
  assert.equal(items.some((item) => item.itemId === "Q003"), false);
  assert.equal(items.some((item) => item.itemId === "TP002"), false);

  const kinds = reviewKinds(items);
  assert.deepEqual(kinds.map((kind) => kind.source).includes("test-point"), true);
  assert.equal(kinds.find((kind) => kind.source === "clarification")?.bulkable, 1);

  const bulk = acceptBulk(root);
  assert.ok(bulk.accepted >= 3);
  assert.ok(bulk.excluded >= 3);
  const left = listReviews(root);
  assert.equal(left.some((item) => item.itemId === "TP001"), false);
  assert.equal(left.some((item) => item.itemId === "TC001"), false);
  assert.equal(left.some((item) => item.itemId === "Q002"), false);
  assert.equal(left.some((item) => item.itemId === "Q001"), true);
  assert.equal(left.some((item) => item.itemId === "TC-ACT"), true);
  assert.equal(fs.readFileSync(path.join(root, "cases", "巡检.md"), "utf8").includes("生命周期"), false);
  assert.throws(() => applyBaseline(root), /还没有审核 TC-ACT/);
});

test("a decision is refused when the file changed after it was opened", () => {
  const root = workspace();
  write(root, "test-points/巡检.md", "### TP001 打开列表\n- 优先级：高\n- 状态：待确认\n");
  const item = listReviews(root).find((entry) => entry.itemId === "TP001");
  fs.appendFileSync(path.join(root, "test-points", "巡检.md"), "\n改过了\n");
  assert.throws(
    () => decideReview(root, item.id, "确认", "", item.fingerprint),
    (error) => error instanceof ReviewError && /被修改了/.test(error.message),
  );
  assert.equal(fs.readFileSync(path.join(root, "test-points", "巡检.md"), "utf8").includes("已确认"), false);
});

test("one-click for test points leaves clarifications for their own button", () => {
  const root = workspace();
  write(root, "knowledge/需求评审.md", CLARIFICATIONS);
  write(root, "test-points/巡检.md", "### TP001 打开列表\n- 优先级：高\n- 状态：待确认\n");
  write(root, "cases/巡检.md", "### TC001 打开列表\n- 优先级：高\n- 状态：待确认\n- 自动化：否\n");
  const points = acceptKind(root, "test-point");
  assert.equal(points.accepted, 1);
  assert.equal(listReviews(root).some((item) => item.itemId === "TP001"), false);
  assert.equal(listReviews(root).some((item) => item.itemId === "TC001"), true);
  assert.equal(listReviews(root).some((item) => item.itemId === "Q002"), true);
  const clarifications = acceptKind(root, "clarification");
  assert.equal(clarifications.accepted, 1);
  assert.equal(clarifications.skipped, 1);
  assert.equal(listReviews(root).some((item) => item.itemId === "Q002"), false);
  assert.equal(listReviews(root).some((item) => item.itemId === "Q001"), true);
  assert.equal(listReviews(root).some((item) => item.itemId === "TC001"), true);
  assert.equal(fs.existsSync(path.join(root, "knowledge", "审核经验.md")), false);
  assert.throws(() => acceptKind(root, "baseline"), /单独授权/);
});

test("cases can be accepted one requirement version at a time", () => {
  const root = workspace();
  write(root, "graph/graph.json", JSON.stringify({ sourceFile: "筑安通V1.1.3需求文档.md" }));
  write(root, "cases/巡检.md", "### TC001 打开列表\n- 优先级：高\n- 状态：待确认\n- 自动化：否\n");
  write(root, "cases/作业.md", "### TC002 新建作业\n- 优先级：中\n- 状态：待确认\n- 需求版本：V1.2.0\n- 自动化：否\n");
  const items = listReviews(root);
  assert.equal(items.find((item) => item.itemId === "TC001")?.requirementVersion, "V1.1.3");
  assert.equal(items.find((item) => item.itemId === "TC002")?.requirementVersion, "V1.2.0");
  const first = acceptKind(root, "case", { version: "V1.1.3" });
  assert.equal(first.accepted, 1);
  assert.equal(listReviews(root).some((item) => item.itemId === "TC001"), false);
  assert.equal(listReviews(root).some((item) => item.itemId === "TC002"), true);
});

test("confirming a test point twice does not write it again", () => {
  const root = workspace();
  write(root, "test-points/巡检.md", "### TP001 打开列表\n- 优先级：高\n- 状态：待确认\n");
  const item = listReviews(root).find((entry) => entry.itemId === "TP001");
  decideReview(root, item.id, "确认", "", item.fingerprint);
  assert.equal(fs.readFileSync(path.join(root, "test-points", "巡检.md"), "utf8").includes("- 状态：已确认"), true);
  assert.throws(() => decideReview(root, item.id, "确认", "", item.fingerprint), /已经处理过/);
});
