"use client";

import { useI18n } from "@/hooks/useI18n";
import type { QaPanelId } from "@/lib/qa/client";
import type { QaOverview } from "@/lib/qa/overview";
import { StageMark, stageColor } from "./qa-ui";
import { stageStatusLabel, stageTitle } from "./text";

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
  const { t } = useI18n();
  if (!hasProject) return null;
  const stages = overview?.stages ?? [];
  const current = stages.find((stage) => stage.id === overview?.currentStage);
  const labelOf = (id: string, fallback: string) => {
    const text = stageTitle(t, id);
    return text === id ? fallback : text;
  };
  return (
    <div
      aria-label={t("qa.aria.pipeline")}
      style={{
        display: "flex", alignItems: "center", gap: 8, minHeight: 34, padding: "0 10px",
        borderBottom: "1px solid var(--border)", background: "var(--bg)", fontSize: 12,
      }}
    >
      <nav style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, overflowX: "auto", scrollbarWidth: "none" }}>
        {stages.length === 0 ? (
          <span style={{ color: "var(--text-dim)" }}>{t("qa.pipeline.loading")}</span>
        ) : stages.map((stage, index) => {
          const active = activePanel === stage.panel;
          const isCurrent = overview?.currentStage === stage.id;
          const name = labelOf(stage.id, stage.label);
          const progress = stage.stepsTotal ? ` ${stage.stepsDone}/${stage.stepsTotal}` : "";
          const next = stage.nextStep ? t("qa.next", { step: stage.nextStep }) : "";
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
                title={t("qa.pipeline.title", { label: name, status: stageStatusLabel(t, stage.status), next })}
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
                {index + 1} {name}{progress}
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
          {t("qa.pendingReview", { count: overview.counts.reviewPending })}
        </button>
      ) : null}
      {current ? (
        <span style={{ flexShrink: 0, color: "var(--text-muted)" }} title={current.nextStep ? t("qa.nextPlain", { step: current.nextStep }) : undefined}>
          {current.nextStep ? t("qa.nextPlain", { step: current.nextStep }) : t("qa.pipeline.current", { label: labelOf(current.id, current.label) })}
        </span>
      ) : overview ? (
        <span style={{ flexShrink: 0, color: stageColor("done") }}>{t("qa.pipeline.done")}</span>
      ) : null}
    </div>
  );
}
