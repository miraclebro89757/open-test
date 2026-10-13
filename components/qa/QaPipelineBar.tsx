"use client";

import type { QaPanelId } from "@/lib/qa/client";
import type { QaOverview } from "@/lib/qa/overview";
import { STAGE_STATUS_LABEL, StageMark, stageColor } from "./qa-ui";

interface Props {
  overview: QaOverview | null;
  hasProject: boolean;
  activePanel: QaPanelId | null;
  onOpenPanel: (panel: QaPanelId) => void;
}

/**
 * The seven stages of a test cycle. Status comes from the agent's checkpoint
 * (tasks/checkpoint.json) and the files in the workspace; a click opens the
 * workbench on that stage.
 */
export function QaPipelineBar({ overview, hasProject, activePanel, onOpenPanel }: Props) {
  if (!hasProject) return null;
  const stages = overview?.stages ?? [];
  const current = stages.find((stage) => stage.id === overview?.currentStage);
  return (
    <div
      aria-label="测试流程"
      style={{
        display: "flex", alignItems: "center", gap: 8, minHeight: 34, padding: "0 10px",
        borderBottom: "1px solid var(--border)", background: "var(--bg)", fontSize: 12,
      }}
    >
      <nav style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, overflowX: "auto", scrollbarWidth: "none" }}>
        {stages.length === 0 ? (
          <span style={{ color: "var(--text-dim)" }}>读取测试进度…</span>
        ) : stages.map((stage, index) => {
          const active = activePanel === stage.panel;
          const isCurrent = overview?.currentStage === stage.id;
          const progress = stage.stepsTotal ? ` ${stage.stepsDone}/${stage.stepsTotal}` : "";
          return (
            <div key={stage.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              {index > 0 ? (
                <span aria-hidden="true" style={{
                  width: 16, height: 1, margin: "0 2px",
                  background: stages[index - 1].status === "done" ? stageColor("done") : "var(--border)",
                }} />
              ) : null}
              <button
                type="button"
                onClick={() => onOpenPanel(stage.panel as QaPanelId)}
                title={`${stage.label}：${STAGE_STATUS_LABEL[stage.status]}${stage.nextStep ? `，下一步 ${stage.nextStep}` : ""}`}
                aria-current={isCurrent ? "step" : undefined}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 8px",
                  borderRadius: 13, cursor: "pointer", whiteSpace: "nowrap", fontSize: 12,
                  border: isCurrent ? "1px solid var(--accent)" : "1px solid transparent",
                  background: active ? "var(--bg-selected)" : "transparent",
                  color: stage.status === "pending" ? "var(--text-muted)" : "var(--text)",
                  fontWeight: isCurrent ? 600 : 400,
                }}
              >
                <StageMark status={stage.status} size={13} />
                {index + 1} {stage.label}{progress}
              </button>
            </div>
          );
        })}
      </nav>
      {overview && overview.counts.reviewPending > 0 ? (
        <button
          type="button"
          onClick={() => onOpenPanel("reviews")}
          style={{
            flexShrink: 0, height: 26, padding: "0 8px", borderRadius: 13, cursor: "pointer", fontSize: 12,
            border: activePanel === "reviews" ? "1px solid var(--accent)" : "1px solid var(--border)",
            background: activePanel === "reviews" ? "var(--bg-selected)" : "transparent",
            color: "var(--text)",
          }}
        >
          待审核 {overview.counts.reviewPending}
        </button>
      ) : null}
      {current ? (
        <span style={{ flexShrink: 0, color: "var(--text-muted)" }} title={current.nextStep ? `下一步 ${current.nextStep}` : undefined}>
          {current.nextStep ? `下一步 ${current.nextStep}` : `当前：${current.label}`}
        </span>
      ) : overview ? (
        <span style={{ flexShrink: 0, color: stageColor("done") }}>流程已完成</span>
      ) : null}
    </div>
  );
}
