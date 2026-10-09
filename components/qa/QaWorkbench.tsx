"use client";

import type { QaAskAgent, QaPanelId } from "@/lib/qa/client";
import { QA_PANEL_TITLES, STAGE_REQUESTS } from "@/lib/qa/client";
import type { QaOverview } from "@/lib/qa/overview";
import type { WorkspaceDir } from "@/lib/qa/assets";
import { EmptyState, buttonStyle } from "./qa-ui";
import { useAskFeedback } from "./useAskFeedback";
import { AssetFilesPanel } from "./panels/AssetFilesPanel";
import { OverviewPanel } from "./panels/OverviewPanel";
import { TestPointsPanel } from "./panels/TestPointsPanel";
import { CasesPanel } from "./panels/CasesPanel";

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

const NAV: QaPanelId[] = ["overview", "knowledge", "test-points", "cases", "automation", "record", "run", "defects", "report"];

interface FolderPanel {
  dir: WorkspaceDir;
  emptyTitle: string;
  emptyHint: string;
  stage?: keyof typeof STAGE_REQUESTS;
  action?: string;
}

const FOLDER_PANELS: Partial<Record<QaPanelId, FolderPanel>> = {
  knowledge: { dir: "knowledge", emptyTitle: "还没有需求知识", emptyHint: "用 @ 把需求文档放进对话，Agent 会把待澄清项和知识写到 knowledge/。", stage: "analysis", action: "分析需求文档" },
  graph: { dir: "graph", emptyTitle: "还没有需求图谱", emptyHint: "需求分析完成后，图谱写在 graph/。" },
  "test-points": { dir: "test-points", emptyTitle: "还没有测试点", emptyHint: "需求分析之后，让 Agent 按功能写测试点，写完等你确认。", stage: "test-points", action: "生成测试点" },
  cases: { dir: "cases", emptyTitle: "还没有用例", emptyHint: "测试点确认之后才能写用例。", stage: "cases", action: "生成用例" },
  automation: { dir: "automation", emptyTitle: "还没有自动化脚本", emptyHint: "录制或运行 Agent 的探索，脚本会写到 automation/。", stage: "record", action: "录制脚本" },
  record: { dir: "automation", emptyTitle: "还没有录制结果", emptyHint: "告诉 Agent 用例编号和沙箱地址，它会打开 Playwright 录制窗口。", stage: "record", action: "开始录制" },
  run: { dir: "automation", emptyTitle: "还没有可执行的脚本", emptyHint: "先录制脚本，再执行。", stage: "run", action: "执行脚本" },
  defects: { dir: "defects", emptyTitle: "还没有缺陷记录", emptyHint: "配置禅道或 Jira 的环境变量后，让 Agent 读取。", stage: "defects", action: "读取缺陷" },
  report: { dir: "reports", emptyTitle: "还没有报告", emptyHint: "用例写好后，让 Agent 写测试简报。", stage: "report", action: "生成测试简报" },
};

function StageAction({ stage, label, onAskAgent }: { stage: keyof typeof STAGE_REQUESTS; label: string; onAskAgent: QaAskAgent }) {
  const { ask, feedback } = useAskFeedback(onAskAgent);
  return (
    <>
      <button type="button" style={buttonStyle("primary")} onClick={() => ask(STAGE_REQUESTS[stage])}>{label}</button>
      {feedback ? <span style={{ alignSelf: "center", fontSize: 12, color: "var(--text-muted)" }}>{feedback}</span> : null}
    </>
  );
}

/** The right-panel workbench: one navigable view per stage of the test cycle. */
export function QaWorkbench({ cwd, overview, error, panel, refreshKey, onPanelChange, onOpenFile, onAskAgent, onChanged }: Props) {
  if (!cwd) {
    return <EmptyState title="先打开一个项目目录" hint="项目目录就是产品工作目录，测试产物都写在里面。在左侧项目列表里打开或新建。" />;
  }
  const folder = FOLDER_PANELS[panel];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <nav
        aria-label="测试工作台"
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
              {QA_PANEL_TITLES[id]}
            </button>
          );
        })}
      </nav>
      <div style={{ flex: 1, minHeight: 0 }}>
        {panel === "overview" || !folder ? (
          <OverviewPanel overview={overview} error={error} onOpenPanel={onPanelChange} onAskAgent={onAskAgent} />
        ) : panel === "test-points" ? (
          <TestPointsPanel cwd={cwd} refreshKey={refreshKey} onAskAgent={onAskAgent} onChanged={onChanged} />
        ) : panel === "cases" ? (
          <CasesPanel cwd={cwd} refreshKey={refreshKey} onAskAgent={onAskAgent} onOpenFile={onOpenFile} onChanged={onChanged} />
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
              ? <StageAction stage={folder.stage} label={folder.action} onAskAgent={onAskAgent} />
              : undefined}
          />
        )}
      </div>
    </div>
  );
}
