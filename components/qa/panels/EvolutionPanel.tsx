"use client";

import { useState } from "react";
import { Badge, EmptyState, buttonStyle } from "../qa-ui";
import { useQaData } from "../useQaData";

interface Change {
  id: string;
  name: string;
  change_type: string;
  rationale: string;
  requires_review: boolean;
}

interface AssetAction {
  asset_id: string;
  title: string;
  file: string;
  action: string;
  requires_review: boolean;
  reasons: string[];
}

interface Regression {
  name: string;
  tier: string;
  automation_recommendation: string;
  rationale: string;
  verification: string;
}

interface Plan {
  evolution_id: string;
  status: string;
  baseline_version: string;
  target_version: string;
  requirement_changes: Change[];
  test_asset_actions: AssetAction[];
  regression_candidates: Regression[];
  applied?: { asset_id: string; action: string }[];
}

const CHANGE_LABEL: Record<string, string> = {
  added: "新增",
  modified: "修改",
  removed: "下线",
  split: "拆分",
  merged: "合并",
  preserved: "保留",
  unmentioned: "新版未提及",
  uncertain: "待确认",
  deferred: "后置",
};

const TIER_LABEL: Record<string, string> = {
  smoke: "冒烟",
  core_regression: "核心回归",
  extended: "扩展回归",
};

const ACTION_LABEL: Record<string, string> = {
  keep: "保留",
  update: "需更新",
  deprecate: "建议废弃",
  pending_review: "待确认",
  create: "新增候选",
  reject: "不采纳",
};

type Tab = "changes" | "assets" | "regression" | "record";

function choicesFor(action: string): { action: string; label: string }[] {
  if (action === "deprecate") return [{ action: "deprecate", label: "确认废弃" }, { action: "defer", label: "暂缓" }, { action: "keep", label: "仍保留" }];
  if (action === "update") return [{ action: "update", label: "标记需更新" }, { action: "defer", label: "暂缓" }, { action: "keep", label: "仍保留" }];
  if (action === "create") return [{ action: "create", label: "生成候选" }, { action: "reject", label: "不采纳" }];
  return [{ action: "keep", label: "保留" }, { action: "defer", label: "暂缓" }, { action: "deprecate", label: "废弃" }];
}

/** Review a saved migration. Nothing here rewrites a case until the person applies a decision. */
export function EvolutionPanel({ cwd, refreshKey, onChanged }: { cwd: string; refreshKey: number; onAskAgent: QaAskAgent; onChanged: () => void }) {
  const { data, error, post } = useQaData<{ plan: Plan | null }>("/api/qa/evolution", cwd, refreshKey);
  const [tab, setTab] = useState<Tab>("changes");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  if (error) return <EmptyState title="读取版本演进失败" hint={error} />;
  if (!data) return <EmptyState title="读取中…" />;
  const plan = data.plan;
  if (!plan) {
    return <EmptyState title="还没有版本演进方案" hint="在同一个产品目录里同时给出基线文档和重构稿。Agent 会先写待审核方案，不会改已有用例。" />;
  }

  const pending = plan.test_asset_actions.filter((item) => item.requires_review);
  const counts = plan.requirement_changes.reduce<Record<string, number>>((all, change) => {
    all[change.change_type] = (all[change.change_type] ?? 0) + 1;
    return all;
  }, {});

  async function apply() {
    const decisions = pending.map((item) => ({ asset_id: item.asset_id, action: choices[item.asset_id] })).filter((item) => item.action);
    const result = await post({ decisions });
    setMessage(result.ok ? "已按审核结果写入生命周期，原步骤都还在。" : result.error);
    if (result.ok) onChanged();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "changes", label: "变更" },
    { id: "assets", label: "测试资产" },
    { id: "regression", label: "回归" },
    { id: "record", label: "记录" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
          <strong>{plan.baseline_version || "基线"} → {plan.target_version || "目标"}</strong>
          <Badge tone={plan.status === "applied" ? "ok" : "warn"}>{plan.status === "applied" ? "已应用" : "待审核"}</Badge>
          <span style={{ color: "var(--text-muted)" }}>{plan.evolution_id}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(counts).map(([type, count]) => (
            <Badge key={type} tone={type === "unmentioned" || type === "uncertain" || type === "removed" ? "warn" : "muted"}>
              {CHANGE_LABEL[type] || type} {count}
            </Badge>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} style={buttonStyle(tab === item.id ? "primary" : "plain")}>{item.label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 12, display: "grid", gap: 10, alignContent: "start" }}>
        {tab === "changes" ? plan.requirement_changes.map((change) => (
          <article key={change.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge tone={change.change_type === "preserved" ? "ok" : "warn"}>{CHANGE_LABEL[change.change_type] || change.change_type}</Badge>
              <strong style={{ fontSize: 13 }}>{change.name}</strong>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{change.rationale}</p>
          </article>
        )) : null}
        {tab === "assets" ? (
          <>
            {plan.test_asset_actions.map((item) => (
              <article key={item.asset_id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge>{ACTION_LABEL[item.action] || item.action}</Badge>
                  <strong style={{ fontSize: 13 }}>{item.asset_id} {item.title}</strong>
                </div>
                <p style={{ margin: "6px 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{item.reasons.join("")}</p>
                {item.requires_review && plan.status !== "applied" ? (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {choicesFor(item.action).map((choice) => (
                      <button
                        key={choice.action}
                        type="button"
                        onClick={() => setChoices((current) => ({ ...current, [item.asset_id]: choice.action }))}
                        style={buttonStyle(choices[item.asset_id] === choice.action ? "primary" : "plain")}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {plan.status !== "applied" ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" style={buttonStyle("primary")} onClick={() => void apply()}>应用已选</button>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>待审核 {pending.length} 条。未选择的不会被猜一个结果。</span>
              </div>
            ) : null}
            {message ? <p style={{ margin: 0, fontSize: 12 }}>{message}</p> : null}
          </>
        ) : null}
        {tab === "regression" ? plan.regression_candidates.map((item) => (
          <article key={item.requirement_id + item.name} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Badge tone="accent">{TIER_LABEL[item.tier] || item.tier}</Badge>
              <strong style={{ fontSize: 13 }}>{item.name}</strong>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.automation_recommendation === "prioritize" ? "优先自动化" : "以后再自动化"} · 尚未验证</span>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{item.rationale}</p>
          </article>
        )) : null}
        {tab === "record" ? (
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            <div>方案 {plan.evolution_id}，状态 {plan.status === "applied" ? "已应用" : "待审核"}。</div>
            {(plan.applied ?? []).map((item) => <div key={item.asset_id}>{item.asset_id}：{ACTION_LABEL[item.action] || item.action}</div>)}
            {plan.status !== "applied" ? <div style={{ color: "var(--text-muted)" }}>应用之后，这里留下每条资产的决定。完整记录也写在 knowledge/evolution/audit.jsonl。</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
