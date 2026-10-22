"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { QaAskAgent, QaPanelId, WorkPolicy } from "@/lib/qa/client";
import { clarificationContinueRequest, stageRequest } from "@/lib/qa/client";
import type { QaOverview } from "@/lib/qa/overview";
import { Badge, EmptyState, StageMark, buttonStyle } from "../qa-ui";
import { panelTitle, policyLabel, stageStatusLabel, stageTitle } from "../text";
import { useAskFeedback } from "../useAskFeedback";
import { SourcePackPanel } from "./SourcePackPanel";

interface Props {
  cwd: string;
  overview: QaOverview | null;
  error: string | null;
  refreshKey: number;
  onOpenPanel: (panel: QaPanelId) => void;
  onAskAgent: QaAskAgent;
  onChanged: () => void;
}

const ALWAYS_STAGED = new Set(["record", "run", "heal", "defects", "report"]);

export function OverviewPanel({ cwd, overview, error, refreshKey, onOpenPanel, onAskAgent, onChanged }: Props) {
  const { t } = useI18n();
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [policyError, setPolicyError] = useState("");
  if (error) return <EmptyState title={t("qa.progress.failed")} hint={error} />;
  if (!overview) return <EmptyState title={t("qa.progress.loading")} />;

  const { counts, stages } = overview;
  const mode = overview.policy.mode;
  const current = stages.find((stage) => stage.id === overview.currentStage);
  const stageId = current?.id ?? "analysis";
  const continueMarks = overview.clarificationContinue;
  const request = continueMarks
    ? clarificationContinueRequest(continueMarks.files)
    : stageRequest(stageId, mode);
  const empty = counts.knowledge + counts.sourcePack + counts.graphNodes + counts.points + counts.cases + counts.uiScripts + counts.apiScripts === 0;
  const wholeBatch = !continueMarks && mode !== "guided" && !ALWAYS_STAGED.has(stageId);

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
        setPolicyError(body.error ?? t("qa.policy.failed"));
        return;
      }
      onChanged();
    } catch (changeError) {
      setPolicyError(changeError instanceof Error ? changeError.message : String(changeError));
    }
  }

  const cards: Array<{ panel: QaPanelId; label: string; value: string; note?: string }> = [
    { panel: "knowledge", label: panelTitle(t, "knowledge"), value: String(counts.knowledge), note: counts.sourcePack ? t("qa.overview.sourcePack", { count: counts.sourcePack }) : counts.graphNodes ? t("qa.overview.graphNodes", { count: counts.graphNodes }) : undefined },
    { panel: "lessons", label: panelTitle(t, "lessons"), value: String(counts.lessons), note: counts.lessons ? t("qa.overview.lessonsEditable") : undefined },
    { panel: "test-points", label: panelTitle(t, "test-points"), value: String(counts.points), note: counts.points ? t("qa.overview.confirmed", { count: counts.pointsConfirmed }) : undefined },
    { panel: "cases", label: panelTitle(t, "cases"), value: String(counts.cases), note: counts.cases ? t("qa.overview.automated", { done: counts.casesAutomated, total: counts.cases }) : undefined },
    { panel: "automation", label: panelTitle(t, "automation"), value: String(counts.uiScripts + counts.apiScripts), note: `UI ${counts.uiScripts} · API ${counts.apiScripts}` },
    { panel: "defects", label: t("qa.overview.defectFiles"), value: String(counts.defects) },
    { panel: "report", label: panelTitle(t, "report"), value: String(counts.reports) },
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
            {t("qa.overview.empty")}
          </p>
        ) : current ? (
          <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
            {continueMarks
              ? <>{t("qa.overview.continueLong")}</>
              : <>{t("qa.overview.current")}<strong style={{ color: "var(--text)" }}>{stageTitle(t, current.id)}</strong>（{stageStatusLabel(t, current.status)}）{current.nextStep ? t("qa.next", { step: current.nextStep }) : ""}</>}
          </p>
        ) : continueMarks ? (
          <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
            {t("qa.overview.continueShort")}
          </p>
        ) : (
          <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: "var(--text-muted)" }}>{t("qa.stagesDone")}</p>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {(["guided", "balanced", "autonomous"] as WorkPolicy[]).map((item) => (
            <button
              key={item}
              type="button"
              title={t("qa.policy.switchTitle")}
              style={buttonStyle(item === mode ? "primary" : "plain")}
              onClick={() => void choosePolicy(item)}
            >
              {policyLabel(t, item)}
            </button>
          ))}
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
          {t("qa.policy.hint")}
        </p>
        {policyError ? <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--qa-bad, #d14343)" }}>{policyError}</p> : null}
        {request && (empty || current || continueMarks) ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={buttonStyle("primary")}
              onClick={() => ask(request)}
            >
              {continueMarks ? t("qa.ask.continue") : wholeBatch ? t("qa.ask.batch") : request.mode === "send" ? t("qa.ask.step") : t("qa.ask.compose")}
            </button>
            {counts.reviewPending > 0 ? (
              <button type="button" style={buttonStyle("plain")} onClick={() => onOpenPanel("reviews")}>
                {t("qa.pendingReview", { count: counts.reviewPending })}
              </button>
            ) : null}
            {feedback ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{feedback}</span> : null}
          </div>
        ) : null}
      </section>

      <SourcePackPanel cwd={cwd} refreshKey={refreshKey} onChanged={onChanged} onAskAgent={onAskAgent} />

      <section>
        <h3 style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>{t("qa.pipeline.heading")}</h3>
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
                <span style={{ flex: 1 }}>{index + 1}. {stageTitle(t, stage.id)}</span>
                {stage.awaitingReview ? <Badge tone="warn">{t("qa.awaiting")}</Badge> : null}
                {stage.stepsTotal ? <Badge>{t("qa.steps", { done: stage.stepsDone, total: stage.stepsTotal })}</Badge> : null}
                <span style={{ color: "var(--text-dim)", fontSize: 11.5 }}>{stageStatusLabel(t, stage.status)}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>{t("qa.assets.heading")}</h3>
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
