"use client";

import { useState } from "react";
import type { QaAskAgent } from "@/lib/qa/client";
import { countByStatus, type DefectList, type DefectSetup, type DefectSystemSetup } from "@/lib/qa/defect-types";
import { Badge, EmptyState, QA_COLORS, buttonStyle, formatTime } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";
import { useQaData } from "../useQaData";
import { AssetFilesPanel } from "./AssetFilesPanel";

interface Props {
  cwd: string;
  refreshKey: number;
  onAskAgent: QaAskAgent;
  onOpenFile: (absolutePath: string) => void;
  onChanged: () => void;
}

interface DefectData {
  setup: DefectSetup;
  defects: DefectList | null;
}

function SystemLine({ name, system }: { name: string; system: DefectSystemSetup }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
      <Badge tone={system.configured ? "ok" : "muted"}>{system.configured ? "已配置" : "未配置"}</Badge>
      <span>{name}</span>
      {!system.configured ? (
        <span style={{ color: "var(--text-dim)" }}>缺 <code>{system.missing.join("、")}</code></span>
      ) : null}
    </div>
  );
}

/** Defects from Zentao or Jira. The page reads them itself with the credentials the server was started with. */
export function DefectsPanel({ cwd, refreshKey, onAskAgent, onOpenFile, onChanged }: Props) {
  const { data, error, post } = useQaData<DefectData>("/api/qa/defects", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (error) return <EmptyState title="读取缺陷失败" hint={error} />;
  if (!data) return <EmptyState title="读取中…" />;

  const { setup, defects } = data;
  const anyConfigured = setup.zentao.configured || setup.jira.configured;
  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    const result = await post({});
    setBusy(false);
    if (!result.ok) setMessage(result.error);
    else {
      setMessage(String(result.body.message ?? ""));
      onChanged();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
        <SystemLine name="禅道" system={setup.zentao} />
        <SystemLine name="Jira" system={setup.jira} />
        {!anyConfigured ? (
          <div style={{ fontSize: 11.5, lineHeight: 1.7, color: "var(--text-muted)" }}>
            在启动 Pi Web 的终端里设置环境变量，再重启。令牌只留在服务端，页面看不到它的值。
            <pre style={{ margin: "6px 0 0", padding: 8, borderRadius: 6, background: "var(--bg-selected)", fontSize: 11, whiteSpace: "pre-wrap" }}>
{`export ZENTAO_BASE_URL=https://zentao.example.com
export ZENTAO_TOKEN=...
# 或 Jira
export JIRA_BASE_URL=https://example.atlassian.net
export JIRA_EMAIL=you@example.com
export JIRA_TOKEN=...`}
            </pre>
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={!anyConfigured || busy} style={buttonStyle("primary", !anyConfigured || busy)} onClick={() => void refresh()}>
            {busy ? "读取中…" : "读取缺陷"}
          </button>
          {defects ? <span style={{ fontSize: 11, color: "var(--text-dim)" }}>上次读取 {formatTime(defects.fetchedAt)}</span> : null}
          <button
            type="button"
            style={{ ...buttonStyle(), marginLeft: "auto" }}
            onClick={() => ask({ mode: "compose", text: "把这个缺陷和用例对应起来，写进 defects/：" })}
          >
            让 Agent 整理缺陷
          </button>
        </div>
        {message ? <div role="status" style={{ fontSize: 12, color: message.includes("HTTP") ? QA_COLORS.bad : "var(--text-muted)" }}>{message}</div> : null}
        {feedback ? <div role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{feedback}</div> : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {defects ? (
          <>
            <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
              共 {defects.bugs.length} 条
              {countByStatus(defects.bugs).map((item) => <Badge key={item.status}>{item.status} {item.count}</Badge>)}
            </div>
            {defects.bugs.length === 0 ? <EmptyState title="没有读到缺陷" /> : defects.bugs.map((bug) => (
              <div key={`${bug.source}-${bug.id}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderTop: "1px solid var(--border)", fontSize: 12.5 }}>
                <Badge tone={bug.source === "jira" ? "accent" : "ok"}>{bug.source === "jira" ? "Jira" : "禅道"}</Badge>
                <span style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{bug.id}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={bug.title}>{bug.title}</span>
                {bug.priority ? <Badge>P{bug.priority.replace(/^P/i, "")}</Badge> : null}
                <Badge tone={/close|done|resolved/i.test(bug.status) ? "muted" : "warn"}>{bug.status || "未知"}</Badge>
              </div>
            ))}
          </>
        ) : (
          <EmptyState title="还没有读取过缺陷" hint={anyConfigured ? "点“读取缺陷”，结果写在 defects/latest.json。" : "配置禅道或 Jira 之后才能读取，没有配置时不会编造缺陷。"} />
        )}
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 8 }}>
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>defects/ 里的文件</div>
          <div style={{ height: 160 }}>
            <AssetFilesPanel cwd={cwd} dir="defects" emptyTitle="没有文件" emptyHint="" refreshKey={refreshKey} onOpenFile={onOpenFile} />
          </div>
        </div>
      </div>
    </div>
  );
}
