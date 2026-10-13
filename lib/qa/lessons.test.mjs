import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

process.env.OPENTEST_LESSONS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "qa-lessons-home-"));

const jiti = createJiti(import.meta.url);
const {
  readLessons,
  saveLesson,
  suggestKeywords,
  classifyLessonScope,
  compactIfDue,
  compactLessons,
  updateLesson,
  globalLessonFile,
} = await jiti.import("./lessons.ts");
const { acceptBulk, decideReview, listReviews } = await jiti.import("./reviews.ts");
const { readClarificationDocuments, applyClarificationUpdate } = await jiti.import("./clarifications.ts");

function workspace() {
  process.env.OPENTEST_LESSONS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "qa-lessons-home-"));
  return fs.mkdtempSync(path.join(os.tmpdir(), "qa-lessons-"));
}

function write(root, relative, text) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function clarification(id, title, source, extra = "") {
  return `### ${id} ${title}\n- 状态：待处理\n- 原文：${source}\n- Agent理解：不确定\n${extra}- 补充：\n\n`;
}

function item(root, id) {
  return readClarificationDocuments(root).flatMap((document) => document.items).find((entry) => entry.id === id);
}

const STRIKE_LESSON = {
  title: "删除线按删除处理",
  scope: "本产品",
  target: "待澄清",
  condition: "原文里某段内容带删除线",
  action: "删除线的都按照删除处理。",
  decision: "已补充",
  keywords: ["删除线"],
  origin: "Q001 已补充",
};

test("the words a decision is about come from the lead of the note", () => {
  assert.deepEqual(
    suggestKeywords("删除线的都按照删除处理。", "消息推送中「微信小程序订阅消息」整段删除线，按已删除处理，还是保留部分能力待定"),
    ["删除线"],
  );
  assert.deepEqual(suggestKeywords("以截图为准", "花名册字段以图为准，无文字描述"), []);
  assert.equal(classifyLessonScope("删除线的都按照删除处理，不用测试。"), "全部产品");
  assert.equal(classifyLessonScope("巡检完成率分母是已整改隐患数。"), "本产品");
});

test("a strikethrough supplement is recorded as a global lesson and applied to similar pending items", () => {
  const root = workspace();
  write(root, "knowledge/需求评审.md", [
    "# 需求评审\n\n## 待澄清问题\n\n",
    clarification("Q001", "订阅消息删除线", "订阅消息整段删除线"),
    clarification("Q002", "巡检提醒删除线", "巡检提醒一段带删除线"),
    clarification("Q003", "活动删除线", "活动模块删除线，是否下线"),
    clarification("Q004", "导出范围", "支持导出"),
  ].join(""));

  const first = listReviews(root).find((entry) => entry.itemId === "Q001");
  const result = decideReview(root, first.id, "已补充", "删除线的都按照删除处理，不用测试。", first.fingerprint);
  assert.equal(result.lesson.scope, "全部产品");
  assert.equal(result.lesson.id, "G001");
  assert.ok(result.lesson.keywords.includes("删除线"));
  assert.equal(item(root, "Q002").status, "已补充");
  assert.equal(item(root, "Q002").basis, "审核经验 G001");
  assert.equal(item(root, "Q003").status, "待处理");
  assert.equal(item(root, "Q004").status, "待处理");
  assert.match(fs.readFileSync(path.join(root, "tasks", "review-log.jsonl"), "utf8"), /删除线的都按照删除处理/);
});

test("a product-specific supplement stays in this product and does not spread", () => {
  const root = workspace();
  write(root, "knowledge/需求评审.md", [
    "# 需求评审\n\n## 待澄清问题\n\n",
    clarification("Q001", "巡检完成率", "巡检总览整改完成率口径未写"),
    clarification("Q002", "隐患完成率", "隐患列表完成率口径未写"),
  ].join(""));
  const first = listReviews(root).find((entry) => entry.itemId === "Q001");
  const result = decideReview(root, first.id, "已补充", "巡检完成率分母是已整改隐患数。", first.fingerprint);
  assert.equal(result.lesson.scope, "本产品");
  assert.equal(result.lesson.id, "R001");
  assert.equal(item(root, "Q002").status, "待处理");
});

test("a second similar mark adds a hit instead of a second heading", () => {
  const root = workspace();
  write(root, "knowledge/需求评审.md", [
    "# 需求评审\n\n## 待澄清问题\n\n",
    clarification("Q001", "订阅消息删除线", "订阅消息整段删除线"),
    clarification("Q002", "公告删除线", "公告一段带删除线"),
  ].join(""));
  const first = listReviews(root).find((entry) => entry.itemId === "Q001");
  decideReview(root, first.id, "已补充", "删除线的都按照删除处理。", first.fingerprint);
  assert.equal(readLessons(root).length, 1);
  const auto = listReviews(root).find((entry) => entry.source === "auto" && entry.itemId === "Q002");
  decideReview(root, auto.id, "认可", "", auto.fingerprint);
  assert.equal(readLessons(root).length, 1);
  assert.ok(readLessons(root)[0].hits >= 2);
});

test("what the agent settled by a lesson is spot-checked, and two overturns turn the lesson off", () => {
  const root = workspace();
  saveLesson(root, STRIKE_LESSON);
  const byAgent = (id, title) => `### ${id} ${title}\n- 状态：已补充\n- 原文：${title}整段删除线\n- Agent理解：按删除处理\n- 补充：删除线的都按照删除处理。\n- 依据：审核经验 R001\n\n`;
  write(root, "knowledge/需求评审.md", `# 需求评审\n\n## 待澄清问题\n\n${byAgent("Q010", "公告")}${byAgent("Q011", "工种")}${byAgent("Q012", "班组")}`);

  const auto = listReviews(root).filter((entry) => entry.source === "auto");
  assert.equal(auto.length, 3);
  assert.equal(auto[0].group, "auto");
  assert.equal(auto[0].bulkEligible, true);
  assert.equal(item(root, "Q010").supplement, "删除线的都按照删除处理。", "依据 after 补充 is not part of it");

  decideReview(root, auto[0].id, "推翻", "", auto[0].fingerprint);
  assert.equal(item(root, "Q010").status, "待处理");
  assert.equal(item(root, "Q010").basis, undefined);
  assert.equal(readLessons(root)[0].status, "已启用");
  const second = listReviews(root).find((entry) => entry.itemId === "Q011");
  decideReview(root, second.id, "推翻", "", second.fingerprint);
  assert.equal(readLessons(root)[0].status, "停用");
  assert.equal(readLessons(root)[0].overturned, 2);
  assert.equal(listReviews(root).find((entry) => entry.itemId === "Q010").lessons.length, 0, "a lesson that is off matches nothing");

  assert.equal(acceptBulk(root).accepted, 1);
  assert.equal(item(root, "Q012").review, "已认可");
  assert.equal(listReviews(root).some((entry) => entry.source === "auto"), false);
});

test("a lesson the agent proposes waits for a person, and a person can apply it to every product", () => {
  const root = workspace();
  write(root, "knowledge/审核经验.md", "# 审核经验\n\n### R001 附件字段以截图为准\n- 状态：待确认\n- 范围：本产品\n- 适用：待澄清\n- 条件：字段只在附件截图里\n- 做法：以截图字段为准\n- 决定：已补充\n- 关键词：截图\n- 命中：0\n- 推翻：0\n");
  write(root, "knowledge/需求评审.md", `# 需求评审\n\n## 待澄清问题\n\n${clarification("Q001", "花名册字段", "花名册字段以截图为准")}`);
  assert.equal(listReviews(root).find((entry) => entry.itemId === "Q001").lessons.length, 0);
  const proposal = listReviews(root).find((entry) => entry.source === "lesson");
  decideReview(root, proposal.id, "启用", "", proposal.fingerprint);
  assert.deepEqual(listReviews(root).find((entry) => entry.itemId === "Q001").lessons.map((hint) => hint.id), ["R001"]);

  const shared = saveLesson(root, { ...STRIKE_LESSON, scope: "全部产品" });
  assert.match(shared.id, /^G\d+/);
  assert.ok(fs.readFileSync(globalLessonFile(), "utf8").includes(`### ${shared.id}`));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "qa-lessons-"));
  write(other, "knowledge/需求评审.md", `# 需求评审\n\n## 待澄清问题\n\n${clarification("Q001", "通知删除线", "通知有删除线")}`);
  assert.deepEqual(listReviews(other).find((entry) => entry.itemId === "Q001").lessons.map((hint) => hint.id), [shared.id]);
});

test("duplicate keyword lessons are merged after 100 review-log lines", () => {
  const root = workspace();
  saveLesson(root, STRIKE_LESSON);
  saveLesson(root, { ...STRIKE_LESSON, origin: "Q009 已补充" });
  assert.equal(readLessons(root).filter((lesson) => lesson.scope === "本产品").length, 2);
  fs.mkdirSync(path.join(root, "tasks"), { recursive: true });
  fs.writeFileSync(path.join(root, "tasks", "review-log.jsonl"), `${Array.from({ length: 100 }, (_, index) => JSON.stringify({ n: index })).join("\n")}\n`);
  const result = compactIfDue(root);
  assert.equal(result.compacted, true);
  assert.equal(readLessons(root).filter((lesson) => lesson.id.startsWith("R") && lesson.status !== "停用").length, 1);
  assert.ok(fs.existsSync(path.join(root, "knowledge", "审核经验.归档.md")));
  compactLessons(root);
});

test("a person can edit a lesson and move it to every product", () => {
  const root = workspace();
  const lesson = saveLesson(root, { ...STRIKE_LESSON, keywords: ["完成率"] });
  const moved = updateLesson(root, lesson.id, { scope: "全部产品", action: "完成率分母按已整改数。", title: "完成率口径" });
  assert.equal(moved.scope, "全部产品");
  assert.match(moved.id, /^G/);
  assert.equal(moved.action, "完成率分母按已整改数。");
  assert.equal(readLessons(root).some((item) => item.id === lesson.id), false);
});

test("a person re-marking an item the agent settled drops the lesson basis", () => {
  const root = workspace();
  write(root, "knowledge/需求评审.md", "# 需求评审\n\n## 待澄清问题\n\n### Q001 公告删除线\n- 状态：已补充\n- 原文：公告删除线\n- Agent理解：按删除\n- 依据：审核经验 R001\n- 补充：按删除处理\n\n");
  applyClarificationUpdate(root, "knowledge/需求评审.md", "Q001", "已补充", "按删除处理");
  assert.equal(item(root, "Q001").basis, "审核经验 R001", "nothing changed, the basis stays");
  applyClarificationUpdate(root, "knowledge/需求评审.md", "Q001", "待讨论", "");
  assert.equal(item(root, "Q001").basis, undefined);
});
