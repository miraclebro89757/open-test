"use client";

import { useI18n } from "@/hooks/useI18n";
import type { QaAskAgent, QaPanelId } from "@/lib/qa/client";
import { STAGE_REQUESTS, stageRequest, type WorkPolicy } from "@/lib/qa/client";
import { panelTitle } from "./text";
import type { QaOverview } from "@/lib/qa/overview";
import type { WorkspaceDir } from "@/lib/qa/assets";
import { EmptyState, buttonStyle } from "./qa-ui";
import { useAskFeedback } from "./useAskFeedback";
import { AssetFilesPanel } from "./panels/AssetFilesPanel";
import { OverviewPanel } from "./panels/OverviewPanel";
import { ClarificationsPanel } from "./panels/ClarificationsPanel";
import { EvolutionPanel } from "./panels/EvolutionPanel";
import { TestPointsPanel } from "./panels/TestPointsPanel";
import { CasesPanel } from "./panels/CasesPanel";
import { RecordPanel } from "./panels/RecordPanel";
import { RunPanel } from "./panels/RunPanel";
import { HealPanel } from "./panels/HealPanel";
import { ReportPanel } from "./panels/ReportPanel";
import { DefectsPanel } from "./panels/DefectsPanel";
import { ReviewsPanel } from "./panels/ReviewsPanel";
import { LessonsPanel } from "./panels/LessonsPanel";

interface Props {
  cwd: string | null;
  overview: QaOverview | null;
  error: string | null;
  panel: QaPanelId;
  /** Bumped when files may have changed, so lists reload. */
  refreshKey: number;
  onPanelChange: (panel: QaPanelId) => void;
  onOpenFile: (absolutePath: string) => void;
  onAskAgent: QaAskAgent;
  /** A panel changed a file; the overview should re-read. */
  onChanged: () => void;
}

const NAV: QaPanelId[] = ["overview", "knowledge", "evolution", "test-points", "cases", "automation", "record", "run", "heal", "defects", "report", "reviews", "lessons"];

interface FolderPanel {
  dir: WorkspaceDir;
  emptyTitle: string;
  emptyHint: string;
  stage?: keyof typeof STAGE_REQUESTS;
  action?: string;
}

function StageAction({ stage, label, mode, onAskAgent }: { stage: keyof typeof STAGE_REQUESTS; label: string; mode: WorkPolicy; onAskAgent: QaAskAgent }) {
  const { t } = useI18n();
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const request = stageRequest(stage, mode);
  const batch = mode !== "guided" && stage !== "record" && stage !== "run" && stage !== "heal" && stage !== "defects" && stage !== "report";
  return (
    <>
      <button type="button" style={buttonStyle("primary")} onClick={() => ask(request)}>{batch ? t("qa.ask.batch") : label}</button>
      {feedback ? <span style={{ alignSelf: "center", fontSize: 12, color: "var(--text-muted)" }}>{feedback}</span> : null}
    </>
  );
}

/** The right-panel workbench: one navigable view per stage of the test cycle. */
export function QaWorkbench({ cwd, overview, error, panel, refreshKey, onPanelChange, onOpenFile, onAskAgent, onChanged }: Props) {
  const { t } = useI18n();
  const folderPanels: Partial<Record<QaPanelId, FolderPanel>> = {
    knowledge: { dir: "knowledge", emptyTitle: t("qa.empty.knowledge"), emptyHint: t("qa.empty.knowledgeHint"), stage: "analysis", action: t("qa.action.analysis") },
    graph: { dir: "graph", emptyTitle: t("qa.empty.graph"), emptyHint: t("qa.empty.graphHint") },
    "test-points": { dir: "test-points", emptyTitle: t("qa.empty.points"), emptyHint: t("qa.empty.pointsHint"), stage: "test-points", action: t("qa.action.points") },
    cases: { dir: "cases", emptyTitle: t("qa.empty.cases"), emptyHint: t("qa.empty.casesHint"), stage: "cases", action: t("qa.action.cases") },
    automation: { dir: "automation", emptyTitle: t("qa.empty.automation"), emptyHint: t("qa.empty.automationHint"), stage: "record", action: t("qa.action.record") },
    record: { dir: "automation", emptyTitle: "", emptyHint: "" },
    run: { dir: "automation", emptyTitle: "", emptyHint: "" },
    heal: { dir: "automation", emptyTitle: "", emptyHint: "" },
    defects: { dir: "defects", emptyTitle: "", emptyHint: "" },
    report: { dir: "reports", emptyTitle: t("qa.empty.report"), emptyHint: t("qa.empty.reportHint"), stage: "report", action: t("qa.action.report") },
  };
  if (!cwd) {
    return <EmptyState title={t("qa.noProject")} hint={t("qa.noProjectHint")} />;
  }
  const folder = folderPanels[panel];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <nav
        aria-label={t("qa.aria.workbench")}
        style={{
          display: "flex", gap: 2, padding: "6px 8px", flexShrink: 0, overflowX: "auto", scrollbarWidth: "none",
          borderBottom: "1px solid var(--border)", background: "var(--bg-panel)",
        }}
      >
        {NAV.map((id) => {
          const active = id === panel || (panel === "graph" && id === "knowledge");
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPanelChange(id)}
              aria-current={active ? "page" : undefined}
              style={{
                height: 24, padding: "0 9px", borderRadius: 12, border: "none", cursor: "pointer", whiteSpace: "nowrap", fontSize: 12,
                background: active ? "var(--bg)" : "transparent",
                color: active ? "var(--text)" : "var(--text-muted)",
                fontWeight: active ? 600 : 400,
                boxShadow: active ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
              }}
            >
              {panelTitle(t, id)}
            </button>
          );
        })}
      </nav>
      <div style={{ flex: 1, minHeight: 0 }}>
        {panel === "reviews" ? (
          <ReviewsPanel cwd={cwd} refreshKey={refreshKey} onChanged={onChanged} />
        ) : panel === "lessons" ? (
          <LessonsPanel cwd={cwd} refreshKey={refreshKey} onChanged={onChanged} />
        ) : panel === "overview" || !folder ? (
          <OverviewPanel cwd={cwd} overview={overview} error={error} refreshKey={refreshKey} onOpenPanel={onPanelChange} onAskAgent={onAskAgent} onChanged={onChanged} />
        ) : panel === "knowledge" ? (
          <ClarificationsPanel cwd={cwd} refreshKey={refreshKey} onAskAgent={onAskAgent} onOpenFile={onOpenFile} onChanged={onChanged} />
        ) : panel === "evolution" ? (
          <EvolutionPanel cwd={cwd} refreshKey={refreshKey} onChanged={onChanged} />
        ) : panel === "test-points" ? (
          <TestPointsPanel cwd={cwd} refreshKey={refreshKey} onAskAgent={onAskAgent} onChanged={onChanged} />
        ) : panel === "cases" ? (
          <CasesPanel cwd={cwd} refreshKey={refreshKey} onAskAgent={onAskAgent} onOpenFile={onOpenFile} onChanged={onChanged} />
        ) : panel === "record" ? (
          <RecordPanel cwd={cwd} refreshKey={refreshKey} onAskAgent={onAskAgent} onOpenFile={onOpenFile} onChanged={onChanged} />
        ) : panel === "run" ? (
          <RunPanel cwd={cwd} refreshKey={refreshKey} onAskAgent={onAskAgent} onOpenFile={onOpenFile} onChanged={onChanged} />
        ) : panel === "heal" ? (
          <HealPanel cwd={cwd} refreshKey={refreshKey} onAskAgent={onAskAgent} onOpenFile={onOpenFile} onChanged={onChanged} />
        ) : panel === "defects" ? (
          <DefectsPanel cwd={cwd} refreshKey={refreshKey} onAskAgent={onAskAgent} onOpenFile={onOpenFile} onChanged={onChanged} />
        ) : panel === "report" ? (
          <ReportPanel cwd={cwd} refreshKey={refreshKey} onAskAgent={onAskAgent} onOpenFile={onOpenFile} onOpenPanel={onPanelChange} onChanged={onChanged} />
        ) : (
          <AssetFilesPanel
            key={panel}
            cwd={cwd}
            dir={folder.dir}
            emptyTitle={folder.emptyTitle}
            emptyHint={folder.emptyHint}
            refreshKey={refreshKey}
            onOpenFile={onOpenFile}
            actions={folder.stage && folder.action
              ? <StageAction stage={folder.stage} label={folder.action} mode={overview?.policy.mode ?? "balanced"} onAskAgent={onAskAgent} />
              : undefined}
          />
        )}
      </div>
    </div>
  );
}
