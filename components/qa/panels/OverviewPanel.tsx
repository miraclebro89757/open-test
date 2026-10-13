"use client";

import { useState } from "react";
import type { QaAskAgent, QaPanelId, WorkPolicy } from "@/lib/qa/client";
import { WORK_POLICY_LABEL, stageRequest } from "@/lib/qa/client";
import type { QaOverview } from "@/lib/qa/overview";
import { Badge, EmptyState, STAGE_STATUS_LABEL, StageMark, buttonStyle } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";

interface Props {
  cwd: string;
  overview: QaOverview | null;
  error: string | null;
  onOpenPanel: (panel: QaPanelId) => void;
  onAskAgent: QaAskAgent;
  onChanged: () => void;
}

const ALWAYS_STAGED = new Set(["record", "run", "heal", "defects", "report"]);

export function OverviewPanel({ cwd, overview, error, onOpenPanel, onAskAgent, onChanged }: Props) {
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [policyError, setPolicyError] = useState("");
  if (error) return <EmptyState title="读取测试进度失败" hint={error} />;
  if (!overview) return <EmptyState title="读取测试进度…" />;

  const { counts, stages } = overview;
  const mode = overview.policy.mode;
  const current = stages.find((stage) => stage.id === overview.currentStage);
  const stageId = current?.id ?? "analysis";
  const request = stageRequest(stageId, mode);
  const empty = counts.knowledge + counts.graphNodes + counts.points + counts.cases + counts.uiScripts + counts.apiScripts === 0;
  const wholeBatch = mode !== "guided" && !ALWAYS_STAGED.has(stageId);

  async function choosePolicy(next: WorkPolicy) {
    setPolicyError("");
    try {
      const response = await fetch("/api/qa/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, mode: next }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setPolicyError(body.error ?? "没有切换成功");
        return;
      }
      onChanged();
    } catch (changeError) {
      setPolicyError(changeError instanceof Error ? changeError.message : String(changeError));
    }
  }

  const cards: Array<{ panel: QaPanelId; label: string; value: string; note?: string }> = [
    { panel: "knowledge", label: "需求知识", value: String(counts.knowledge), note: counts.graphNodes ? `图谱节点 ${counts.graphNodes}` : undefined },
    { panel: "test-points", label: "测试点", value: String(counts.points), note: counts.points ? `已确认 ${counts.pointsConfirmed}` : undefined },
    { panel: "cases", label: "用例", value: String(counts.cases), note: counts.cases ? `自动化 ${counts.casesAutomated}/${counts.cases}` : undefined },
    { panel: "automation", label: "自动化脚本", value: String(counts.uiScripts + counts.apiScripts), note: `UI ${counts.uiScripts} · API ${counts.apiScripts}` },
    { panel: "defects", label: "缺陷文件", value: String(counts.defects) },
    { panel: "report", label: "报告", value: String(counts.reports) },
  ];

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", height: "100%" }}>
      <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--bg-panel)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <strong style={{ fontSize: 14 }}>{overview.product}</strong>
          <span style={{ color: "var(--text-dim)", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={overview.workspace}>{overview.workspace}</span>
        </div>
        {empty ? (
          <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
            这个目录还没有测试产物。把需求文档用 @ 放进对话，Agent 会按需求、测试点、用例的顺序往下做，产物都会写在这个目录里。
          </p>
        ) : current ? (
          <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
            当前阶段：<strong style={{ color: "var(--text)" }}>{current.label}</strong>（{STAGE_STATUS_LABEL[current.status]}）
            {current.nextStep ? `，下一步 ${current.nextStep}` : ""}
          </p>
        ) : (
          <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: "var(--text-muted)" }}>七个阶段都已完成。</p>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {(Object.keys(WORK_POLICY_LABEL) as WorkPolicy[]).map((item) => (
            <button
              key={item}
              type="button"
              style={buttonStyle(item === mode ? "primary" : "plain")}
              onClick={() => void choosePolicy(item)}
            >
              {WORK_POLICY_LABEL[item]}
            </button>
          ))}
        </div>
        {policyError ? <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--qa-bad, #d14343)" }}>{policyError}</p> : null}
        {request && (empty || current) ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={buttonStyle("primary")}
              onClick={() => ask(request)}
            >
              {wholeBatch ? "开始整批任务" : request.mode === "send" ? "让 Agent 做这一步" : "在输入框里补全后发送"}
            </button>
            {counts.reviewPending > 0 ? (
              <button type="button" style={buttonStyle("plain")} onClick={() => onOpenPanel("reviews")}>
                待审核 {counts.reviewPending}
              </button>
            ) : null}
            {feedback ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{feedback}</span> : null}
          </div>
        ) : null}
      </section>

      <section>
        <h3 style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>流程</h3>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
          {stages.map((stage, index) => (
            <li key={stage.id}>
              <button
                type="button"
                onClick={() => onOpenPanel(stage.panel as QaPanelId)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", height: 32, padding: "0 10px",
                  borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
                  cursor: "pointer", fontSize: 12.5, textAlign: "left",
                }}
              >
                <StageMark status={stage.status} />
                <span style={{ flex: 1 }}>{index + 1}. {stage.label}</span>
                {stage.awaitingReview ? <Badge tone="warn">有待审</Badge> : null}
                {stage.stepsTotal ? <Badge>{stage.stepsDone}/{stage.stepsTotal} 步</Badge> : null}
                <span style={{ color: "var(--text-dim)", fontSize: 11.5 }}>{STAGE_STATUS_LABEL[stage.status]}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>资产</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
          {cards.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => onOpenPanel(card.panel)}
              style={{
                padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)",
                color: "var(--text)", cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>{card.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", minHeight: 14 }}>{card.note ?? ""}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
