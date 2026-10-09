"use client";

import type { QaAskAgent, QaPanelId } from "@/lib/qa/client";
import { STAGE_REQUESTS } from "@/lib/qa/client";
import type { RunRecord } from "@/lib/qa/runs";
import { QA_COLORS, buttonStyle, formatTime } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";
import { useQaData } from "../useQaData";
import { AssetFilesPanel } from "./AssetFilesPanel";

interface Props {
  cwd: string;
  refreshKey: number;
  onAskAgent: QaAskAgent;
  onOpenFile: (absolutePath: string) => void;
  onOpenPanel: (panel: QaPanelId) => void;
}

/** Reports written so far, with the latest real run as the ground the next report should stand on. */
export function ReportPanel({ cwd, refreshKey, onAskAgent, onOpenFile, onOpenPanel }: Props) {
  const { data } = useQaData<{ runs: RunRecord[] }>("/api/qa/run", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const latest = data?.runs[0] ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "grid", gap: 6, fontSize: 12 }}>
        {latest ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-muted)" }}>最近一次执行 {formatTime(latest.startedAt)}</span>
            <span style={{ color: QA_COLORS.ok }}>通过 {latest.summary.passed}</span>
            <span style={{ color: latest.summary.failed ? QA_COLORS.bad : "var(--text-muted)" }}>失败 {latest.summary.failed}</span>
            <button type="button" style={{ ...buttonStyle(), height: 24, padding: "0 8px", marginLeft: "auto" }} onClick={() => onOpenPanel("run")}>查看执行</button>
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)" }}>还没有执行过脚本。报告里的通过率只能来自真实执行，没有执行就不会写数字。</div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" style={buttonStyle("primary")} onClick={() => ask(STAGE_REQUESTS.report)}>生成测试简报</button>
          {feedback ? <span role="status" style={{ color: "var(--text-muted)" }}>{feedback}</span> : null}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AssetFilesPanel
          cwd={cwd}
          dir="reports"
          emptyTitle="还没有报告"
          emptyHint="用例写好、脚本执行过之后，让 Agent 写测试简报。"
          refreshKey={refreshKey}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  );
}
