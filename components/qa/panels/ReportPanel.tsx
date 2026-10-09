"use client";

import { useState } from "react";
import type { QaAskAgent, QaPanelId } from "@/lib/qa/client";
import type { BriefData } from "@/lib/qa/brief";
import { QA_COLORS, buttonStyle } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";
import { useQaData } from "../useQaData";
import { AssetFilesPanel } from "./AssetFilesPanel";

interface Props {
  cwd: string;
  refreshKey: number;
  onAskAgent: QaAskAgent;
  onOpenFile: (absolutePath: string) => void;
  onOpenPanel: (panel: QaPanelId) => void;
  onChanged: () => void;
}

/**
 * The test brief. The page shows what it would say now and writes it on request;
 * every number comes from files, and a missing run says so instead of a rate.
 */
export function ReportPanel({ cwd, refreshKey, onAskAgent, onOpenFile, onOpenPanel, onChanged }: Props) {
  const { data, error, reload } = useQaData<{ brief: BriefData }>("/api/qa/report", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const write = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/qa/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      const body = (await response.json()) as { relative?: string; file?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setMessage(`已写入 ${body.relative}`);
      await reload();
      onChanged();
      if (body.file) onOpenFile(body.file);
    } catch (writeError) {
      setMessage(writeError instanceof Error ? writeError.message : String(writeError));
    } finally {
      setBusy(false);
    }
  };

  const brief = data?.brief;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" disabled={busy} style={buttonStyle("primary", busy)} onClick={() => void write()}>生成测试简报</button>
          <button type="button" style={buttonStyle()} onClick={() => ask({ mode: "compose", text: "在测试简报里补充风险分析和发版建议，只用 reports/ 和 defects/ 里已有的数字：" })}>让 Agent 补充分析</button>
          <button type="button" style={{ ...buttonStyle(), marginLeft: "auto" }} onClick={() => onOpenPanel("run")}>查看执行</button>
        </div>
        {message ? <div role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{message}</div> : null}
        {feedback ? <div role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{feedback}</div> : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>现在生成会写成这样</div>
        {error ? (
          <div role="alert" style={{ padding: "0 12px 12px", fontSize: 12, color: QA_COLORS.bad }}>{error}</div>
        ) : brief ? (
          <pre aria-label="简报预览" style={{ margin: "0 12px 12px", padding: 10, borderRadius: 6, background: "var(--bg-selected)", whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.7, fontFamily: "inherit" }}>{brief.text}</pre>
        ) : null}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>reports/ 里的文件</div>
          <div style={{ height: 200 }}>
            <AssetFilesPanel
              cwd={cwd}
              dir="reports"
              emptyTitle="还没有报告"
              emptyHint="点“生成测试简报”。"
              refreshKey={refreshKey}
              onOpenFile={onOpenFile}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
