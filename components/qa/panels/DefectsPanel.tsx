"use client";

import { useI18n } from "@/hooks/useI18n";
import type { QaAskAgent } from "@/lib/qa/client";
import { countByStatus, type DefectList, type DefectSetup, type TrackerMcp } from "@/lib/qa/defect-types";
import { Badge, EmptyState, buttonStyle, formatTime } from "../qa-ui";
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

function kindLabel(t: (key: string) => string, kind: string): string {
  if (kind === "jira") return "Jira";
  if (kind === "zentao") return t("qa.defects.zentao");
  return t("qa.defects.tracker");
}

/** Sent to the agent in Chinese, whichever language the page is showing. */
function readRequest(trackers: TrackerMcp[]): string {
  const names = trackers.filter((item) => item.enabled).map((item) => item.name);
  const who = names.length ? `已连接的缺陷 MCP：${names.join("、")}。` : "当前没有连接缺陷跟踪 MCP。";
  return [
    who,
    "用这些 MCP 的工具读取当前缺陷，也可以新建、评论或改状态。不要用环境变量直连禅道或 Jira，也不要自己请求它们的 HTTP 接口。",
    "读到之后调用 record_defects，写入来源、编号、标题、优先级和状态。",
    "没有连接任何缺陷 MCP 时，告诉我到设置的 MCP 里添加 Jira、禅道或其他缺陷跟踪服务，不要编造缺陷。",
  ].join("");
}

/** Defects come from a bug tracker the user connected as an MCP server. */
export function DefectsPanel({ cwd, refreshKey, onAskAgent, onOpenFile }: Props) {
  const { t } = useI18n();
  const { data, error } = useQaData<DefectData>("/api/qa/defects", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);

  if (error) return <EmptyState title={t("qa.defects.loadFailed")} hint={error} />;
  if (!data) return <EmptyState title={t("qa.loading")} />;

  const trackers = data.setup.trackers;
  const connected = trackers.some((item) => item.enabled);
  const defects = data.defects;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
        {trackers.length ? trackers.map((item) => (
          <div key={item.name} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
            <Badge tone={item.enabled ? "ok" : "muted"}>{item.enabled ? t("qa.defects.configured") : t("qa.defects.notConfigured")}</Badge>
            <span>{item.name}</span>
            <span style={{ color: "var(--text-dim)" }}>{kindLabel(t, item.kind)}</span>
          </div>
        )) : (
          <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)" }}>{t("qa.defects.setup")}</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={buttonStyle("primary")} onClick={() => ask({ mode: "send", text: readRequest(trackers) })}>
            {t("qa.defects.fetch")}
          </button>
          {defects ? <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("qa.defects.last", { time: formatTime(defects.fetchedAt) })}</span> : null}
          <button
            type="button"
            style={{ ...buttonStyle(), marginLeft: "auto" }}
            onClick={() => ask({ mode: "compose", text: "把这个缺陷和用例对应起来，写进 defects/。改缺陷状态、评论或新建时，只用已经连接的缺陷跟踪 MCP：" })}
          >
            {t("qa.defects.organize")}
          </button>
        </div>
        {feedback ? <div role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{feedback}</div> : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {defects ? (
          <>
            <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
              {t("qa.defects.total", { count: defects.bugs.length })}
              {countByStatus(defects.bugs).map((item) => <Badge key={item.status}>{item.status} {item.count}</Badge>)}
            </div>
            {defects.bugs.length === 0 ? <EmptyState title={t("qa.defects.noneFetched")} /> : defects.bugs.map((bug) => (
              <div key={`${bug.source}-${bug.id}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderTop: "1px solid var(--border)", fontSize: 12.5 }}>
                <Badge tone={bug.source === "jira" ? "accent" : "ok"}>{bug.source === "jira" ? "Jira" : bug.source === "zentao" ? t("qa.defects.zentao") : bug.source}</Badge>
                <span style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{bug.id}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={bug.title}>{bug.title}</span>
                {bug.priority ? <Badge>P{bug.priority.replace(/^P/i, "")}</Badge> : null}
                <Badge tone={/close|done|resolved/i.test(bug.status) ? "muted" : "warn"}>{bug.status || t("qa.value.unknown")}</Badge>
              </div>
            ))}
          </>
        ) : (
          <EmptyState title={t("qa.defects.never")} hint={connected ? t("qa.defects.neverHint") : t("qa.defects.needSetup")} />
        )}
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 8 }}>
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>{t("qa.defects.files")}</div>
          <div style={{ height: 160 }}>
            <AssetFilesPanel cwd={cwd} dir="defects" emptyTitle={t("qa.defects.noFiles")} emptyHint="" refreshKey={refreshKey} onOpenFile={onOpenFile} />
          </div>
        </div>
      </div>
    </div>
  );
}
