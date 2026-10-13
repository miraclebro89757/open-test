import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { STATUS_CONFIRMED, STATUS_PENDING, readCases, readTestPoints } from "./assets";
import { applyClarificationUpdate, readClarificationDocuments } from "./clarifications";
import { applyEvolutionPlan, readEvolutionPlan } from "./evolution";
import {
  compactIfDue,
  feedbackToLesson,
  findLesson,
  lessonIdFromBasis,
  lessonMatches,
  readLessons,
  recordFeedback,
  recordLessonHit,
  recordLessonOverturn,
  setLessonStatus,
  PRODUCT_LESSON_FILE,
  type Lesson,
} from "./lessons";
import { setItemField } from "./markdown";
import { applyPointAction, ReviewError } from "./review";
import { keepHeal, listPendingHeals } from "./runner";

export type ReviewLevel = "L2" | "L3" | "L4";
export type ReviewGroup = "required" | "lesson" | "auto" | "sample" | "bulk";
export type ReviewSource = "clarification" | "auto" | "lesson" | "test-point" | "case" | "evolution" | "heal" | "baseline";

export const REVIEW_KIND_LABEL: Record<ReviewSource, string> = {
  clarification: "待澄清",
  auto: "经验抽查",
  lesson: "待启用经验",
  "test-point": "测试点",
  case: "用例草稿",
  evolution: "版本演进",
  heal: "选择器自愈",
  baseline: "应用基线",
};

export const REVIEW_KIND_BULK: Partial<Record<ReviewSource, string>> = {
  clarification: "本类已补充",
  auto: "本类认可",
  lesson: "本类启用",
  "test-point": "本类确认",
  case: "本类接受",
  evolution: "本类按建议处理",
  heal: "本类留下新选择器",
};

export const REVIEW_KIND_ORDER: ReviewSource[] = [
  "clarification", "auto", "lesson", "test-point", "case", "evolution", "heal", "baseline",
];

export interface LessonHint {
  id: string;
  title: string;
  decision: string;
  action: string;
}

export interface ReviewItem {
  id: string;
  source: ReviewSource;
  title: string;
  feature: string;
  level: ReviewLevel;
  group: ReviewGroup;
  reason: string;
  evidence: string;
  before: string;
  after: string;
  impact: string;
  blocking: boolean;
  bulkEligible: boolean;
  suggested: string;
  file: string;
  itemId: string;
  fingerprint: string;
  /** Enabled lessons whose keywords all appear in a pending clarification. */
  lessons: LessonHint[];
}

const HIGH_RISK = /下线|废弃|疑似删除|当成删除|已经删除|视为删除|互相矛盾|互相冲突|规则缺失|没有可执行规则|缺少判定|新版未提及|对不上|核心回归/;

/** Model confidence cannot move these phrases down to an automatic edit. */
export function riskLevel(text: string): "L2" | "L3" {
  return HIGH_RISK.test(text) ? "L3" : "L2";
}

function fileHash(absolute: string): string {
  return createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
}

function hashOf(workspace: string, relative: string): string {
  const absolute = path.join(workspace, relative);
  return fs.existsSync(absolute) ? fileHash(absolute) : "";
}

function featureFromFile(relative: string): string {
  return path.basename(relative, path.extname(relative));
}

export function appendReviewLog(workspace: string, event: Record<string, unknown>): void {
  const dir = path.join(workspace, "tasks");
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, "review-log.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), actorType: "user", ...event })}\n`);
}

function appendLog(workspace: string, event: Record<string, unknown>): void {
  appendReviewLog(workspace, event);
}

/** What the agent needs later to see a pattern in the decisions. */
function logEntry(item: ReviewItem, decision: string, note: string): Record<string, unknown> {
  return {
    id: item.id,
    source: item.source,
    decision,
    title: item.title,
    feature: item.feature,
    level: item.level,
    evidence: item.evidence.slice(0, 300),
    ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}),
  };
}

function hint(lesson: Lesson): LessonHint {
  return { id: lesson.id, title: lesson.title, decision: lesson.decision, action: lesson.action };
}

function assertFingerprint(current: string, expected: unknown): void {
  if (typeof expected === "string" && expected && expected !== current) {
    throw new ReviewError("文件在打开后被修改了，请重新查看", 409);
  }
}

interface EvolutionAction {
  asset_id: string;
  title: string;
  file: string;
  action: string;
  requires_review?: boolean;
  reasons?: string[];
  requirement_id?: string;
}

interface EvolutionChange {
  id: string;
  name: string;
  change_type: string;
  rationale?: string;
}

function evolutionLevel(action: EvolutionAction, change?: EvolutionChange): ReviewLevel {
  const text = `${action.title}\n${(action.reasons || []).join("\n")}\n${change?.rationale || ""}\n${change?.change_type || ""}`;
  if (action.action === "deprecate" || change?.change_type === "removed" || change?.change_type === "unmentioned" || change?.change_type === "uncertain" || riskLevel(text) === "L3") {
    return "L3";
  }
  return "L2";
}

export function listReviews(workspace: string): ReviewItem[] {
  const items: ReviewItem[] = [];
  const lessons = readLessons(workspace);

  for (const document of readClarificationDocuments(workspace)) {
    const fingerprint = hashOf(workspace, document.file);
    for (const item of document.items) {
      const text = `${item.title}\n${item.source}\n${item.understanding}`;
      const level = riskLevel(text);
      const feature = item.group || item.title;
      const byLesson = lessonIdFromBasis(item.basis);
      if (item.status !== "待处理" && byLesson && !item.review) {
        // The agent marked this by a lesson. A person spot-checks it; a high-risk one is not settled until a person looks.
        items.push({
          id: `auto:${document.file}:${item.id}`,
          source: "auto",
          title: item.title,
          feature,
          level,
          group: level === "L3" ? "required" : "auto",
          reason: level === "L3"
            ? `Agent 按审核经验 ${byLesson} 处理了这条，但它涉及删除、矛盾或缺失规则，经验不能替人决定。`
            : `Agent 按审核经验 ${byLesson} 处理了这条。看一眼，不对就推翻。`,
          evidence: item.source || item.understanding,
          before: "待处理",
          after: item.supplement ? `${item.status}：${item.supplement}` : item.status,
          impact: level === "L3" ? `挡住「${feature}」的用例` : "不挡住其他功能",
          blocking: level === "L3",
          bulkEligible: level !== "L3",
          suggested: "认可",
          file: document.file,
          itemId: item.id,
          fingerprint,
          lessons: [],
        });
        continue;
      }
      if (item.status !== "待处理") continue;
      const matched = lessons.filter((lesson) => lessonMatches(lesson, text)).map(hint);
      items.push({
        id: `clarification:${document.file}:${item.id}`,
        source: "clarification",
        title: item.title,
        feature,
        level,
        group: level === "L3" ? "required" : matched.length ? "lesson" : "sample",
        reason: level === "L3"
          ? "这条歧义涉及删除、矛盾或缺失规则，不能自动当真。"
          : matched.length
            ? `和审核经验 ${matched[0].id} 相符，可以照它处理。`
            : "需求里有歧义，需要人决定怎么理解。",
        evidence: item.source || item.understanding,
        before: "待处理",
        after: matched.length ? `${matched[0].decision}：${matched[0].action}` : "忽略、已补充或待讨论",
        impact: level === "L3" ? `挡住「${feature}」的用例` : "不挡住其他功能",
        blocking: level === "L3",
        bulkEligible: level !== "L3",
        suggested: matched.length ? `按经验 ${matched[0].id}` : "逐项决定",
        file: document.file,
        itemId: item.id,
        fingerprint,
        lessons: matched,
      });
    }
  }

  const lessonFingerprint = hashOf(workspace, PRODUCT_LESSON_FILE);
  for (const lesson of lessons) {
    if (lesson.status !== "待确认") continue;
    items.push({
      id: `lesson:${lesson.id}`,
      source: "lesson",
      title: `${lesson.id} ${lesson.title}`,
      feature: lesson.target,
      level: "L2",
      group: "sample",
      reason: "Agent 从你过去的决定里总结出这条经验。启用后，相似的条目会照它处理。",
      evidence: `条件：${lesson.condition}\n做法：${lesson.action}${lesson.keywords.length ? `\n关键词：${lesson.keywords.join("、")}` : ""}`,
      before: "待确认",
      after: "已启用",
      impact: lesson.scope === "全部产品" ? "所有产品" : "只在这个产品",
      blocking: false,
      bulkEligible: true,
      suggested: "启用",
      file: lesson.scope === "全部产品" ? "" : PRODUCT_LESSON_FILE,
      itemId: lesson.id,
      fingerprint: lesson.scope === "全部产品" ? "" : lessonFingerprint,
      lessons: [],
    });
  }

  for (const file of readTestPoints(workspace)) {
    const fingerprint = hashOf(workspace, file.file);
    for (const item of file.items) {
      if (item.status === STATUS_CONFIRMED) continue;
      const feature = featureFromFile(file.file);
      items.push({
        id: `test-point:${file.file}:${item.id}`,
        source: "test-point",
        title: `${item.id} ${item.title}`,
        feature,
        level: "L2",
        group: "bulk",
        reason: "测试点草稿已生成，确认它是否覆盖了该场景。",
        evidence: item.body,
        before: "这是新生成的，还没有旧版本",
        after: "已确认",
        impact: "不挡住其他功能",
        blocking: false,
        bulkEligible: true,
        suggested: "确认",
        file: file.file,
        itemId: item.id,
        fingerprint,
        lessons: [],
      });
    }
  }

  for (const file of readCases(workspace)) {
    const fingerprint = hashOf(workspace, file.file);
    for (const item of file.items) {
      if (item.status !== STATUS_PENDING) continue;
      const feature = featureFromFile(file.file);
      items.push({
        id: `case:${file.file}:${item.id}`,
        source: "case",
        title: `${item.id} ${item.title}`,
        feature,
        level: "L2",
        group: "bulk",
        reason: "用例草稿已生成，接受或退回。",
        evidence: item.body,
        before: "这是新生成的，还没有旧版本",
        after: "已接受",
        impact: "不挡住其他功能",
        blocking: false,
        bulkEligible: true,
        suggested: "接受",
        file: file.file,
        itemId: item.id,
        fingerprint,
        lessons: [],
      });
    }
  }

  const plan = readEvolutionPlan(workspace) as {
    evolution_id?: string;
    status?: string;
    choices?: Record<string, string>;
    requirement_changes?: EvolutionChange[];
    test_asset_actions?: EvolutionAction[];
  } | null;
  if (plan && plan.status === "review_required") {
    const fingerprint = hashOf(workspace, path.join("knowledge", "evolution", "current.json"));
    const changes = new Map((plan.requirement_changes || []).map((change) => [change.id, change]));
    const choices = plan.choices || {};
    for (const action of plan.test_asset_actions || []) {
      if (!action.requires_review || choices[action.asset_id]) continue;
      const change = changes.get(action.requirement_id || "");
      const level = evolutionLevel(action, change);
      const feature = action.title || change?.name || action.asset_id;
      items.push({
        id: `evolution:${action.asset_id}`,
        source: "evolution",
        title: `${action.asset_id} ${action.title}`,
        feature,
        level,
        group: level === "L3" ? "required" : action.action === "update" || action.action === "create" ? "sample" : "bulk",
        reason: (action.reasons || []).join("") || "版本演进建议需要人决定。",
        evidence: change?.rationale || feature,
        before: "旧用例和旧测试点仍在",
        after: action.action,
        impact: level === "L3" ? `挡住「${feature}」当成删除或废弃` : "不挡住其他功能",
        blocking: level === "L3",
        bulkEligible: level !== "L3",
        suggested: action.action,
        file: "knowledge/evolution/current.json",
        itemId: action.asset_id,
        fingerprint,
        lessons: [],
      });
    }
    items.push({
      id: `baseline:${plan.evolution_id || "current"}`,
      source: "baseline",
      title: "应用版本演进基线",
      feature: plan.evolution_id || "版本演进",
      level: "L4",
      group: "required",
      reason: "应用会给已有用例写上生命周期。点应用之前，旧文件保持原样。",
      evidence: "knowledge/evolution/current.json",
      before: "待审核",
      after: "已应用",
      impact: "只改已选择的标记，不删除用例",
      blocking: false,
      bulkEligible: false,
      suggested: "单独授权",
      file: "knowledge/evolution/current.json",
      itemId: plan.evolution_id || "current",
      fingerprint,
      lessons: [],
    });
  }

  for (const entry of listPendingHeals(workspace)) {
    items.push({
      id: `heal:${entry.before}`,
      source: "heal",
      title: featureFromFile(entry.relativeFile),
      feature: featureFromFile(entry.relativeFile),
      level: "L2",
      group: "sample",
      reason: "选择器已经先换成新的，以便这次执行能跑完。留哪一版由人决定。",
      evidence: `${entry.oldSelector} → ${entry.newSelector}`,
      before: entry.oldSelector,
      after: entry.newSelector,
      impact: "不挡住其他功能",
      blocking: false,
      bulkEligible: true,
      suggested: "留下新选择器",
      file: entry.relativeFile,
      itemId: entry.before,
      fingerprint: fs.existsSync(entry.before) ? fileHash(entry.before) : "",
      lessons: [],
    });
  }

  return items;
}

export function blockedFeatureNames(items: ReviewItem[] = []): string[] {
  return [...new Set(items.filter((item) => item.blocking).map((item) => item.feature))];
}

function writeField(workspace: string, kind: "test-points" | "cases", file: string, id: string, name: string, value: string): void {
  const absolute = path.join(workspace, file);
  const markdown = fs.readFileSync(absolute, "utf8");
  const next = setItemField(markdown, id, name, value);
  if (next === null) throw new ReviewError("事项不存在", 404);
  if (next !== markdown) {
    const temporary = `${absolute}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, next);
    fs.renameSync(temporary, absolute);
  }
}

function saveEvolutionChoice(workspace: string, assetId: string, action: string): void {
  const relative = path.join("knowledge", "evolution", "current.json");
  const absolute = path.join(workspace, relative);
  if (!fs.existsSync(absolute)) throw new ReviewError("没有版本演进方案", 404);
  const plan = JSON.parse(fs.readFileSync(absolute, "utf8")) as { test_asset_actions?: EvolutionAction[]; choices?: Record<string, string> };
  const target = (plan.test_asset_actions || []).find((item) => item.asset_id === assetId);
  if (!target) throw new ReviewError("事项不存在", 404);
  const allowed = ["keep", "update", "deprecate", "defer", "create", "reject"];
  if (!allowed.includes(action)) throw new ReviewError("不支持这个决定");
  plan.choices = { ...(plan.choices || {}), [assetId]: action };
  fs.writeFileSync(absolute, `${JSON.stringify(plan, null, 2)}\n`);
}

function clarificationItem(workspace: string, file: string, itemId: string) {
  const item = readClarificationDocuments(workspace).find((document) => document.file === file)?.items.find((entry) => entry.id === itemId);
  if (!item) throw new ReviewError("事项不存在", 404);
  return item;
}

/** A person chose to settle this clarification the way the lesson says. */
function applyLessonTo(workspace: string, item: ReviewItem, lessonId: string, reviewed = false): void {
  const lesson = findLesson(workspace, lessonId);
  if (lesson.status !== "已启用" || lesson.target !== "待澄清") throw new ReviewError(`经验 ${lessonId} 没有启用`);
  applyClarificationUpdate(workspace, item.file, item.itemId, lesson.decision, lesson.decision === "已补充" ? lesson.action : "", {
    basis: `审核经验 ${lesson.id}`,
    review: reviewed ? "已认可" : null,
  });
  recordLessonHit(workspace, lesson.id);
}

/** Global conventions spread to the other pending items; product rules stay until a person (or the agent) uses them. */
export function spreadRecordedLesson(workspace: string, lesson: Lesson | null): { applied: number; skipped: number } {
  if (!lesson || lesson.scope !== "全部产品" || !lesson.keywords.length) return { applied: 0, skipped: 0 };
  return applyLesson(workspace, lesson.id);
}

function recordAssetReturn(workspace: string, item: ReviewItem, decision: string, note: string): Lesson | null {
  const draft = feedbackToLesson({
    decision,
    note,
    title: item.title,
    evidence: item.evidence,
    target: item.source === "case" ? "用例" : "测试点",
    origin: `${item.itemId} ${decision}`,
  });
  return draft ? recordFeedback(workspace, draft, `${item.title}\n${item.evidence}`) : null;
}

export function decideReview(workspace: string, id: string, decision: string, note: string, fingerprint: string): { item: ReviewItem | null; lesson: Lesson | null } {
  const current = listReviews(workspace).find((entry) => entry.id === id);
  if (!current) throw new ReviewError("事项不存在或已经处理过", 404);
  assertFingerprint(current.fingerprint, fingerprint);
  let recorded: Lesson | null = null;
  if (current.source === "clarification") {
    if (decision.startsWith("lesson:")) applyLessonTo(workspace, current, decision.slice("lesson:".length), true);
    else {
      if (decision === "已补充" && !note.trim()) throw new ReviewError("已补充的条目需要写上补充内容");
      recorded = applyClarificationUpdate(workspace, current.file, current.itemId, decision, note).lesson;
    }
  } else if (current.source === "auto") {
    const item = clarificationItem(workspace, current.file, current.itemId);
    const lessonId = lessonIdFromBasis(item.basis);
    if (decision === "认可") {
      applyClarificationUpdate(workspace, current.file, current.itemId, item.status, item.supplement, { basis: item.basis ?? null, review: "已认可" });
      if (lessonId) recordLessonHit(workspace, lessonId);
    } else if (decision === "推翻") {
      applyClarificationUpdate(workspace, current.file, current.itemId, "待处理", "", { basis: null, review: null });
      if (lessonId) recordLessonOverturn(workspace, lessonId);
    } else throw new ReviewError("不支持这个决定");
  } else if (current.source === "lesson") {
    if (decision === "启用") setLessonStatus(workspace, current.itemId, "已启用");
    else if (decision === "不采纳") setLessonStatus(workspace, current.itemId, "停用");
    else throw new ReviewError("不支持这个决定");
  } else if (current.source === "test-point") {
    if (decision === "确认") applyPointAction(workspace, current.file, { action: "confirm", ids: [current.itemId] });
    else if (decision === "退回") {
      writeField(workspace, "test-points", current.file, current.itemId, "退回说明", note || "退回");
      recorded = recordAssetReturn(workspace, current, decision, note);
    } else throw new ReviewError("不支持这个决定");
  } else if (current.source === "case") {
    if (decision === "接受") writeField(workspace, "cases", current.file, current.itemId, "状态", "已接受");
    else if (decision === "退回") {
      writeField(workspace, "cases", current.file, current.itemId, "状态", "退回");
      writeField(workspace, "cases", current.file, current.itemId, "退回说明", note || "退回");
      recorded = recordAssetReturn(workspace, current, decision, note);
    } else throw new ReviewError("不支持这个决定");
  } else if (current.source === "evolution") {
    saveEvolutionChoice(workspace, current.itemId, decision);
  } else if (current.source === "heal") {
    if (decision !== "before" && decision !== "after") throw new ReviewError("不支持这个决定");
    keepHeal(workspace, current.itemId, decision);
  } else if (current.source === "baseline") {
    throw new ReviewError("应用基线要单独授权");
  }
  appendLog(workspace, logEntry(current, decision, note));
  compactIfDue(workspace);
  if (recorded) spreadRecordedLesson(workspace, recorded);
  return { item: listReviews(workspace).find((entry) => entry.id === id) ?? null, lesson: recorded };
}

/**
 * Settle every pending clarification this lesson matches. High-risk ones stay
 * for a person to open one by one, even when the keywords match.
 */
export function applyLesson(workspace: string, lessonId: string): { applied: number; skipped: number } {
  const matching = listReviews(workspace).filter((item) => item.source === "clarification" && item.lessons.some((lesson) => lesson.id === lessonId));
  let applied = 0;
  for (const item of matching) {
    if (item.level !== "L2") continue;
    applyLessonTo(workspace, item, lessonId);
    applied += 1;
  }
  const skipped = matching.length - applied;
  if (applied) appendLog(workspace, { id: `lesson:${lessonId}`, source: "lesson", decision: "apply-lesson", applied, skipped });
  return { applied, skipped };
}

export interface ReviewKindSummary {
  source: ReviewSource;
  label: string;
  bulkLabel: string;
  count: number;
  high: number;
  bulkable: number;
}

export function reviewKinds(items: ReviewItem[]): ReviewKindSummary[] {
  return REVIEW_KIND_ORDER.map((source) => {
    const rows = items.filter((item) => item.source === source);
    return {
      source,
      label: REVIEW_KIND_LABEL[source],
      bulkLabel: REVIEW_KIND_BULK[source] ?? "",
      count: rows.length,
      high: rows.filter((item) => item.level === "L3" || item.level === "L4").length,
      bulkable: rows.filter((item) => item.bulkEligible).length,
    };
  }).filter((kind) => kind.count > 0);
}

/**
 * One-click for a single task type. L3/L4 stay for a person to open one by one.
 * Per-item 忽略 / 已补充 / 确认 / 退回 still work afterwards on whatever remains.
 */
export function acceptKind(workspace: string, source: string): { accepted: number; skipped: number } {
  if (source === "baseline") throw new ReviewError("应用基线要单独授权");
  if (!(source in REVIEW_KIND_LABEL)) throw new ReviewError("不支持这个任务类型");
  const items = listReviews(workspace).filter((item) => item.source === source);
  let accepted = 0;
  let skipped = 0;
  const seenFiles = new Set<string>();
  for (const item of items) {
    if (!item.bulkEligible || item.level === "L3" || item.level === "L4") {
      skipped += 1;
      continue;
    }
    if (item.source === "clarification") {
      if (item.lessons[0]) applyLessonTo(workspace, item, item.lessons[0].id);
      else {
        const current = clarificationItem(workspace, item.file, item.itemId);
        const note = (current.understanding || current.source || item.title).slice(0, 4000);
        applyClarificationUpdate(workspace, item.file, item.itemId, "已补充", note || "按原文理解", { skipLesson: true });
      }
      accepted += 1;
    } else if (item.source === "test-point") {
      if (seenFiles.has(item.file)) continue;
      seenFiles.add(item.file);
      accepted += applyPointAction(workspace, item.file, { action: "confirm-all" }).changed;
    } else if (item.source === "case") {
      writeField(workspace, "cases", item.file, item.itemId, "状态", "已接受");
      accepted += 1;
    } else if (item.source === "auto") {
      decideReview(workspace, item.id, "认可", "", "");
      accepted += 1;
    } else if (item.source === "lesson") {
      setLessonStatus(workspace, item.itemId, "已启用");
      accepted += 1;
    } else if (item.source === "evolution") {
      saveEvolutionChoice(workspace, item.itemId, item.suggested);
      accepted += 1;
    } else if (item.source === "heal") {
      keepHeal(workspace, item.itemId, "after");
      accepted += 1;
    } else skipped += 1;
  }
  if (accepted) appendLog(workspace, { id: `kind:${source}`, source, decision: "accept-kind", accepted, skipped });
  return { accepted, skipped };
}

const ACCEPT_KIND_ORDER: ReviewSource[] = ["lesson", "clarification", "auto", "test-point", "case", "evolution", "heal"];

export function acceptBulk(workspace: string): { accepted: number; excluded: number } {
  const items = listReviews(workspace);
  const excluded = items.filter((item) => !item.bulkEligible).length;
  let accepted = 0;
  for (const source of ACCEPT_KIND_ORDER) {
    if (!items.some((item) => item.source === source)) continue;
    accepted += acceptKind(workspace, source).accepted;
  }
  if (accepted) appendLog(workspace, { id: "bulk", decision: "accept-bulk", accepted, excluded });
  return { accepted, excluded };
}

export function applyBaseline(workspace: string): Record<string, unknown> {
  const plan = readEvolutionPlan(workspace) as { choices?: Record<string, string> } | null;
  if (!plan) throw new ReviewError("没有版本演进方案", 404);
  const decisions = Object.entries(plan.choices || {}).map(([asset_id, action]) => ({ asset_id, action }));
  const applied = applyEvolutionPlan(workspace, decisions);
  appendLog(workspace, { id: "baseline", decision: "apply" });
  return applied;
}
