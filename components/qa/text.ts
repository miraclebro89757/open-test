import type { TranslationParams } from "@/lib/i18n/types";

type Translate = (key: string, params?: TranslationParams) => string;

const STORED: Record<string, string> = {
  正常: "qa.value.normal",
  废弃: "qa.value.deprecated",
  未执行: "qa.value.notRun",
  通过: "qa.value.passed",
  失败: "qa.value.failed",
  跳过: "qa.value.skipped",
  已确认: "qa.value.confirmed",
  待确认: "qa.value.pending",
  待处理: "qa.value.open",
  忽略: "qa.value.ignore",
  已补充: "qa.value.supplemented",
  待讨论: "qa.value.discuss",
  已启用: "qa.value.enabled",
  停用: "qa.value.disabled",
  本产品: "qa.value.thisProduct",
  全部产品: "qa.value.allProducts",
  未标明: "qa.value.unspecified",
  未知: "qa.value.unknown",
};

const DECISION: Record<string, string> = {
  忽略: "qa.value.ignore",
  已补充: "qa.value.supplemented",
  待讨论: "qa.value.discuss",
  认可: "qa.decision.accept",
  推翻: "qa.decision.overturn",
  启用: "qa.decision.enable",
  不采纳: "qa.decision.dismiss",
  确认: "qa.decision.confirm",
  退回: "qa.decision.return",
  接受: "qa.decision.acceptCase",
  after: "qa.decision.keepSelector",
  before: "qa.decision.revertSelector",
  apply: "qa.decision.applySelected",
  deprecate: "qa.decision.confirmDeprecate",
  defer: "qa.decision.defer",
  keep: "qa.decision.keep",
  update: "qa.decision.markUpdate",
  create: "qa.decision.createCandidate",
  reject: "qa.decision.reject",
};

function named(t: Translate, prefix: string, id: string): string {
  const key = `${prefix}.${id}`;
  const text = t(key);
  return text === key ? id : text;
}

export function storedLabel(t: Translate, value: string): string {
  const key = STORED[value];
  return key ? t(key) : value;
}

export function panelTitle(t: Translate, id: string): string {
  return named(t, "qa.panel", id);
}

export function stageTitle(t: Translate, id: string): string {
  return named(t, "qa.stage", id);
}

export function stageStatusLabel(t: Translate, status: string): string {
  return named(t, "qa.stageStatus", status);
}

export function policyLabel(t: Translate, mode: string): string {
  return named(t, "qa.policy", mode);
}

export function decisionLabel(t: Translate, decision: string): string {
  const key = DECISION[decision];
  return key ? t(key) : decision;
}

export function kindLabel(t: Translate, source: string): string {
  return named(t, "qa.kind", source);
}

export function kindBulkLabel(t: Translate, source: string): string {
  const key = `qa.kindBulk.${source}`;
  const text = t(key);
  return text === key ? "" : text;
}
