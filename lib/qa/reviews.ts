import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { STATUS_CONFIRMED, STATUS_PENDING, readCases, readTestPoints } from "./assets";
import { applyClarificationUpdate, readClarificationDocuments } from "./clarifications";
import { applyEvolutionPlan, readEvolutionPlan } from "./evolution";
import { setItemField } from "./markdown";
import { applyPointAction, ReviewError } from "./review";
import { keepHeal, listPendingHeals } from "./runner";

export type ReviewLevel = "L2" | "L3" | "L4";
export type ReviewGroup = "required" | "sample" | "bulk";
export type ReviewSource = "clarification" | "test-point" | "case" | "evolution" | "heal" | "baseline";

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

function appendLog(workspace: string, event: Record<string, unknown>): void {
  const dir = path.join(workspace, "tasks");
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, "review-log.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), actorType: "user", ...event })}\n`);
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

  for (const document of readClarificationDocuments(workspace)) {
    const fingerprint = hashOf(workspace, document.file);
    for (const item of document.items) {
      if (item.status !== "待处理") continue;
      const text = `${item.title}\n${item.source}\n${item.understanding}`;
      const level = riskLevel(text);
      const feature = item.group || item.title;
      items.push({
        id: `clarification:${document.file}:${item.id}`,
        source: "clarification",
        title: item.title,
        feature,
        level,
        group: level === "L3" ? "required" : "sample",
        reason: level === "L3" ? "这条歧义涉及删除、矛盾或缺失规则，不能自动当真。" : "需求里有歧义，需要人决定怎么理解。",
        evidence: item.source || item.understanding,
        before: "待处理",
        after: "忽略、已补充或待讨论",
        impact: level === "L3" ? `挡住「${feature}」的用例` : "不挡住其他功能",
        blocking: level === "L3",
        bulkEligible: false,
        suggested: "逐项决定",
        file: document.file,
        itemId: item.id,
        fingerprint,
      });
    }
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
        bulkEligible: false,
        suggested: action.action,
        file: "knowledge/evolution/current.json",
        itemId: action.asset_id,
        fingerprint,
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
      bulkEligible: false,
      suggested: "留下新选择器",
      file: entry.relativeFile,
      itemId: entry.before,
      fingerprint: fs.existsSync(entry.before) ? fileHash(entry.before) : "",
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

export function decideReview(workspace: string, id: string, decision: string, note: string, fingerprint: string): ReviewItem | null {
  const current = listReviews(workspace).find((item) => item.id === id);
  if (!current) throw new ReviewError("事项不存在或已经处理过", 404);
  assertFingerprint(current.fingerprint, fingerprint);
  if (current.source === "clarification") {
    if (decision === "已补充" && !note.trim()) throw new ReviewError("已补充的条目需要写上补充内容");
    applyClarificationUpdate(workspace, current.file, current.itemId, decision, note);
  } else if (current.source === "test-point") {
    if (decision === "确认") applyPointAction(workspace, current.file, { action: "confirm", ids: [current.itemId] });
    else if (decision === "退回") writeField(workspace, "test-points", current.file, current.itemId, "退回说明", note || "退回");
    else throw new ReviewError("不支持这个决定");
  } else if (current.source === "case") {
    if (decision === "接受") writeField(workspace, "cases", current.file, current.itemId, "状态", "已接受");
    else if (decision === "退回") {
      writeField(workspace, "cases", current.file, current.itemId, "状态", "退回");
      writeField(workspace, "cases", current.file, current.itemId, "退回说明", note || "退回");
    } else throw new ReviewError("不支持这个决定");
  } else if (current.source === "evolution") {
    saveEvolutionChoice(workspace, current.itemId, decision);
  } else if (current.source === "heal") {
    if (decision !== "before" && decision !== "after") throw new ReviewError("不支持这个决定");
    keepHeal(workspace, current.itemId, decision);
  } else if (current.source === "baseline") {
    throw new ReviewError("应用基线要单独授权");
  }
  appendLog(workspace, { id, source: current.source, decision });
  return listReviews(workspace).find((item) => item.id === id) ?? null;
}

export function acceptBulk(workspace: string): { accepted: number; excluded: number } {
  const items = listReviews(workspace);
  const excluded = items.filter((item) => !item.bulkEligible).length;
  let accepted = 0;
  const seenFiles = new Set<string>();
  for (const item of items) {
    if (!item.bulkEligible) continue;
    if (item.source === "test-point") {
      if (seenFiles.has(item.file)) continue;
      seenFiles.add(item.file);
      const result = applyPointAction(workspace, item.file, { action: "confirm-all" });
      accepted += result.changed;
    } else if (item.source === "case") {
      writeField(workspace, "cases", item.file, item.itemId, "状态", "已接受");
      accepted += 1;
    } else if (item.source === "evolution") {
      saveEvolutionChoice(workspace, item.itemId, item.suggested);
      accepted += 1;
    }
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
