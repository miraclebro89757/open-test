"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { TranslationParams } from "@/lib/i18n/types";
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
  requirement_id?: string;
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

type Tab = "changes" | "assets" | "regression" | "record";
type Translate = (key: string, params?: TranslationParams) => string;

function named(t: Translate, prefix: string, id: string): string {
  const key = `${prefix}.${id}`;
  const text = t(key);
  return text === key ? id : text;
}

function choicesFor(t: Translate, action: string): { action: string; label: string }[] {
  if (action === "deprecate") return [{ action: "deprecate", label: t("qa.decision.confirmDeprecate") }, { action: "defer", label: t("qa.decision.defer") }, { action: "keep", label: t("qa.decision.keep") }];
  if (action === "update") return [{ action: "update", label: t("qa.decision.markUpdate") }, { action: "defer", label: t("qa.decision.defer") }, { action: "keep", label: t("qa.decision.keep") }];
  if (action === "create") return [{ action: "create", label: t("qa.decision.createCandidate") }, { action: "reject", label: t("qa.decision.reject") }];
  return [{ action: "keep", label: t("qa.assetAction.keep") }, { action: "defer", label: t("qa.decision.defer") }, { action: "deprecate", label: t("qa.decision.deprecate") }];
}

/** Review a saved migration. Nothing here rewrites a case until the person applies a decision. */
export function EvolutionPanel({ cwd, refreshKey, onChanged }: { cwd: string; refreshKey: number; onChanged: () => void }) {
  const { t } = useI18n();
  const { data, error, post } = useQaData<{ plan: Plan | null }>("/api/qa/evolution", cwd, refreshKey);
  const [tab, setTab] = useState<Tab>("changes");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  if (error) return <EmptyState title={t("qa.evolution.loadFailed")} hint={error} />;
  if (!data) return <EmptyState title={t("qa.loading")} />;
  const plan = data.plan;
  if (!plan) {
    return <EmptyState title={t("qa.evolution.empty")} hint={t("qa.evolution.emptyHint")} />;
  }

  const pending = plan.test_asset_actions.filter((item) => item.requires_review);
  const counts = plan.requirement_changes.reduce<Record<string, number>>((all, change) => {
    all[change.change_type] = (all[change.change_type] ?? 0) + 1;
    return all;
  }, {});

  async function apply() {
    const decisions = pending.map((item) => ({ asset_id: item.asset_id, action: choices[item.asset_id] })).filter((item) => item.action);
    const result = await post({ decisions });
    setMessage(result.ok ? t("qa.evolution.appliedMsg") : result.error);
    if (result.ok) onChanged();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "changes", label: t("qa.evolution.changes") },
    { id: "assets", label: t("qa.evolution.assets") },
    { id: "regression", label: t("qa.evolution.regression") },
    { id: "record", label: t("qa.evolution.record") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
          <strong>{plan.baseline_version || t("qa.evolution.baseline")} → {plan.target_version || t("qa.evolution.target")}</strong>
          <Badge tone={plan.status === "applied" ? "ok" : "warn"}>{plan.status === "applied" ? t("qa.evolution.applied") : t("qa.evolution.pendingReview")}</Badge>
          <span style={{ color: "var(--text-muted)" }}>{plan.evolution_id}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(counts).map(([type, count]) => (
            <Badge key={type} tone={type === "unmentioned" || type === "uncertain" || type === "removed" ? "warn" : "muted"}>
              {named(t, "qa.change", type)} {count}
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
              <Badge tone={change.change_type === "preserved" ? "ok" : "warn"}>{named(t, "qa.change", change.change_type)}</Badge>
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
                  <Badge>{named(t, "qa.assetAction", item.action)}</Badge>
                  <strong style={{ fontSize: 13 }}>{item.asset_id} {item.title}</strong>
                </div>
                <p style={{ margin: "6px 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{item.reasons.join("")}</p>
                {item.requires_review && plan.status !== "applied" ? (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {choicesFor(t, item.action).map((choice) => (
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
                <button type="button" style={buttonStyle("primary")} onClick={() => void apply()}>{t("qa.evolution.apply")}</button>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("qa.evolution.pending", { count: pending.length })}</span>
              </div>
            ) : null}
            {message ? <p style={{ margin: 0, fontSize: 12 }}>{message}</p> : null}
          </>
        ) : null}
        {tab === "regression" ? plan.regression_candidates.map((item) => (
          <article key={item.requirement_id + item.name} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Badge tone="accent">{named(t, "qa.tier", item.tier)}</Badge>
              <strong style={{ fontSize: 13 }}>{item.name}</strong>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("qa.evolution.unverified", { recommendation: item.automation_recommendation === "prioritize" ? t("qa.evolution.prioritize") : t("qa.evolution.later") })}</span>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{item.rationale}</p>
          </article>
        )) : null}
        {tab === "record" ? (
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            <div>{t("qa.evolution.plan", { id: plan.evolution_id, status: plan.status === "applied" ? t("qa.evolution.applied") : t("qa.evolution.pendingReview") })}</div>
            {(plan.applied ?? []).map((item) => <div key={item.asset_id}>{item.asset_id}：{named(t, "qa.assetAction", item.action)}</div>)}
            {plan.status !== "applied" ? <div style={{ color: "var(--text-muted)" }}>{t("qa.evolution.audit")}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
