"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
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

function SystemLine({ name, system, configuredLabel, unconfiguredLabel, missingText }: { name: string; system: DefectSystemSetup; configuredLabel: string; unconfiguredLabel: string; missingText: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
      <Badge tone={system.configured ? "ok" : "muted"}>{system.configured ? configuredLabel : unconfiguredLabel}</Badge>
      <span>{name}</span>
      {!system.configured ? (
        <span style={{ color: "var(--text-dim)" }}>{missingText}</span>
      ) : null}
    </div>
  );
}

/** Defects from Zentao or Jira. The page reads them itself with the credentials the server was started with. */
export function DefectsPanel({ cwd, refreshKey, onAskAgent, onOpenFile, onChanged }: Props) {
  const { t } = useI18n();
  const { data, error, post } = useQaData<DefectData>("/api/qa/defects", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (error) return <EmptyState title={t("qa.defects.loadFailed")} hint={error} />;
  if (!data) return <EmptyState title={t("qa.loading")} />;

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
        <SystemLine name={t("qa.defects.zentao")} system={setup.zentao} configuredLabel={t("qa.defects.configured")} unconfiguredLabel={t("qa.defects.notConfigured")} missingText={t("qa.defects.missing", { names: setup.zentao.missing.join("、") })} />
        <SystemLine name="Jira" system={setup.jira} configuredLabel={t("qa.defects.configured")} unconfiguredLabel={t("qa.defects.notConfigured")} missingText={t("qa.defects.missing", { names: setup.jira.missing.join("、") })} />
        {!anyConfigured ? (
          <div style={{ fontSize: 11.5, lineHeight: 1.7, color: "var(--text-muted)" }}>
            {t("qa.defects.setup")}
            <pre style={{ margin: "6px 0 0", padding: 8, borderRadius: 6, background: "var(--bg-selected)", fontSize: 11, whiteSpace: "pre-wrap" }}>
{`export ZENTAO_BASE_URL=https://zentao.example.com
export ZENTAO_TOKEN=...
# ${t("qa.defects.orJira")}
export JIRA_BASE_URL=https://example.atlassian.net
export JIRA_EMAIL=you@example.com
export JIRA_TOKEN=...`}
            </pre>
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={!anyConfigured || busy} style={buttonStyle("primary", !anyConfigured || busy)} onClick={() => void refresh()}>
            {busy ? t("qa.defects.fetching") : t("qa.defects.fetch")}
          </button>
          {defects ? <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("qa.defects.last", { time: formatTime(defects.fetchedAt) })}</span> : null}
          <button
            type="button"
            style={{ ...buttonStyle(), marginLeft: "auto" }}
            onClick={() => ask({ mode: "compose", text: "把这个缺陷和用例对应起来，写进 defects/：" })}
          >
            {t("qa.defects.organize")}
          </button>
        </div>
        {message ? <div role="status" style={{ fontSize: 12, color: message.includes("HTTP") ? QA_COLORS.bad : "var(--text-muted)" }}>{message}</div> : null}
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
                <Badge tone={bug.source === "jira" ? "accent" : "ok"}>{bug.source === "jira" ? "Jira" : t("qa.defects.zentao")}</Badge>
                <span style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{bug.id}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={bug.title}>{bug.title}</span>
                {bug.priority ? <Badge>P{bug.priority.replace(/^P/i, "")}</Badge> : null}
                <Badge tone={/close|done|resolved/i.test(bug.status) ? "muted" : "warn"}>{bug.status || t("qa.value.unknown")}</Badge>
              </div>
            ))}
          </>
        ) : (
          <EmptyState title={t("qa.defects.never")} hint={anyConfigured ? t("qa.defects.neverHint") : t("qa.defects.needSetup")} />
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
