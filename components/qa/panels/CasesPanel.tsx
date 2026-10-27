"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { QaAskAgent } from "@/lib/qa/client";
import { STAGE_REQUESTS } from "@/lib/qa/client";
import type { QaFile, QaItem } from "@/lib/qa/assets";
import { Badge, EmptyState, buttonStyle } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";
import { useQaData } from "../useQaData";
import { CaseSheetPanel } from "./CaseSheetPanel";
import { ItemEditor } from "./ItemEditor";
import { storedLabel } from "../text";

interface Props {
  cwd: string;
  refreshKey: number;
  onAskAgent: QaAskAgent;
  onOpenFile: (absolutePath: string) => void;
  onChanged: () => void;
}

type AutomationFilter = "all" | "yes" | "no";
type RecordingFilter = "all" | "yes" | "no";

/** Cases with their automation coverage; a row opens the steps and the scripts. */
export function CasesPanel({ cwd, refreshKey, onAskAgent, onOpenFile, onChanged }: Props) {
  const { t } = useI18n();
  const { data, error, post } = useQaData<{ files: QaFile[] }>("/api/qa/cases", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [priority, setPriority] = useState("");
  const [version, setVersion] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [runResult, setRunResult] = useState("");
  const [automation, setAutomation] = useState<AutomationFilter>("all");
  const [recording, setRecording] = useState<RecordingFilter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const all = useMemo(() => (data?.files ?? []).flatMap((file) => file.items), [data]);
  const priorities = useMemo(() => [...new Set(all.map((item) => item.priority).filter(Boolean))], [all]);
  const versions = useMemo(() => [...new Set(all.map((item) => item.requirementVersion).filter(Boolean))] as string[], [all]);
  const modules = useMemo(() => [...new Set(all.map((item) => item.module).filter(Boolean))] as string[], [all]);
  const automated = all.filter((item) => item.automated).length;
  const visible = all.filter((item) => {
    if (priority && item.priority !== priority) return false;
    if (version && item.requirementVersion !== version) return false;
    if (moduleName && item.module !== moduleName) return false;
    if (lifecycle && item.lifecycle !== lifecycle) return false;
    if (runResult && item.runResult !== runResult) return false;
    if (automation === "yes" && !item.automated) return false;
    if (automation === "no" && item.automated) return false;
    if (recording === "yes" && !item.recordingNeed) return false;
    if (recording === "no" && item.recordingNeed) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${item.id} ${item.title}`.toLowerCase().includes(needle);
  });

  if (error) return <EmptyState title={t("qa.cases.loadFailed")} hint={error} />;
  if (!data) return <EmptyState title={t("qa.loading")} />;
  if (!all.length) {
    return (
      <EmptyState title={t("qa.cases.empty")} hint={t("qa.cases.emptyHint")}>
        <button type="button" style={buttonStyle("primary")} onClick={() => ask(STAGE_REQUESTS.cases)}>{t("qa.action.cases")}</button>
        {feedback ? <div style={{ marginTop: 8, fontSize: 12 }}>{feedback}</div> : null}
      </EmptyState>
    );
  }

  const percent = Math.round((automated / all.length) * 100);
  const absolute = (relative: string) => `${cwd.replace(/\/+$/, "")}/${relative}`;
  const selectStyle = { height: 26, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12 } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
          <span style={{ color: "var(--text-muted)" }}>{t("qa.overview.automated", { done: automated, total: all.length })}</span>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--bg-selected)", overflow: "hidden" }} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${percent}%`, height: "100%", background: "var(--qa-ok, #2f9e60)" }} />
          </div>
          <span style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{percent}%</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("qa.cases.search")}
            aria-label={t("qa.cases.searchLabel")}
            style={{ ...selectStyle, flex: 1, minWidth: 100, padding: "0 8px" }}
          />
          <select value={version} onChange={(event) => setVersion(event.target.value)} aria-label={t("qa.cases.version")} style={selectStyle}>
            <option value="">{t("qa.cases.versionAll")}</option>
            {versions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={moduleName} onChange={(event) => setModuleName(event.target.value)} aria-label={t("qa.cases.module")} style={selectStyle}>
            <option value="">{t("qa.cases.moduleAll")}</option>
            {modules.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)} aria-label={t("qa.cases.status")} style={selectStyle}>
            <option value="">{t("qa.cases.statusAll")}</option>
            <option value="正常">{storedLabel(t, "正常")}</option>
            <option value="废弃">{storedLabel(t, "废弃")}</option>
          </select>
          <select value={runResult} onChange={(event) => setRunResult(event.target.value)} aria-label={t("qa.cases.result")} style={selectStyle}>
            <option value="">{t("qa.cases.resultAll")}</option>
            {["未执行", "通过", "失败", "跳过"].map((value) => <option key={value} value={value}>{storedLabel(t, value)}</option>)}
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label={t("qa.cases.priority")} style={selectStyle}>
            <option value="">{t("qa.cases.priorityAll")}</option>
            {priorities.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={automation} onChange={(event) => setAutomation(event.target.value as AutomationFilter)} aria-label={t("qa.cases.automation")} style={selectStyle}>
            <option value="all">{t("qa.cases.automationAll")}</option>
            <option value="yes">{t("qa.cases.automationYes")}</option>
            <option value="no">{t("qa.cases.automationNo")}</option>
          </select>
          <select value={recording} onChange={(event) => setRecording(event.target.value as RecordingFilter)} aria-label={t("qa.cases.recordNeed")} style={selectStyle}>
            <option value="all">{t("qa.cases.recordAll")}</option>
            <option value="yes">{t("qa.cases.recordYes")}</option>
            <option value="no">{t("qa.cases.recordNo")}</option>
          </select>
        </div>
        <CaseSheetPanel cwd={cwd} refreshKey={refreshKey} onChanged={onChanged} />
        {feedback ? <div role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{feedback}</div> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {visible.length === 0 ? <EmptyState title={t("qa.cases.none")} /> : visible.map((item: QaItem) => {
          const rowKey = `${item.file}#${item.id}`;
          const expanded = open === rowKey;
          return (
            <div key={rowKey} style={{ borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 12.5 }}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : rowKey)}
                  aria-expanded={expanded}
                  style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, color: "var(--text)", cursor: "pointer", textAlign: "left", fontSize: 12.5 }}
                >
                  <span style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{item.id}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.title}>{item.title}</span>
                </button>
                {item.module ? <Badge>{item.module}</Badge> : null}
                {item.requirementVersion ? <Badge>{item.requirementVersion}</Badge> : null}
                <Badge tone={item.lifecycle === "废弃" ? "bad" : "ok"}>{storedLabel(t, item.lifecycle || "正常")}</Badge>
                <Badge tone={item.runResult === "失败" ? "bad" : item.runResult === "通过" ? "ok" : "muted"}>{storedLabel(t, item.runResult || "未执行")}</Badge>
                {item.priority ? <Badge>{item.priority}</Badge> : null}
                <Badge tone={item.recordingNeed ? "ok" : "muted"}>{item.recordingNeed ? t("qa.cases.recordNeed") : t("qa.cases.recordSkip")}</Badge>
                <Badge tone={item.automated ? "ok" : "muted"}>{item.automated ? t("qa.value.automated") : t("qa.value.manual")}</Badge>
                {item.automated ? (
                  item.scripts.slice(0, 1).map((script) => (
                    <button key={script} type="button" style={{ ...buttonStyle(), height: 24, padding: "0 8px" }} title={script} onClick={() => onOpenFile(absolute(script))}>
                      {script.split("/").pop()}
                    </button>
                  ))
                ) : item.recordingNeed ? (
                  <button
                    type="button"
                    style={{ ...buttonStyle(), height: 24, padding: "0 8px" }}
                    onClick={() => ask({ mode: "compose", text: `为用例 ${item.id}（${item.title}）录制自动化脚本。沙箱地址：` })}
                  >
                    {t("qa.cases.record")}
                  </button>
                ) : null}
              </div>
              {expanded && editing !== rowKey ? (
                <div style={{ padding: "4px 12px 12px 36px" }}>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)", fontFamily: "inherit" }}>{item.body}</pre>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button type="button" style={buttonStyle()} onClick={() => setEditing(rowKey)}>{t("qa.edit")}</button>
                    {item.scripts.map((script) => (
                      <button key={script} type="button" style={buttonStyle()} onClick={() => onOpenFile(absolute(script))}>{t("qa.openNamed", { name: script.split("/").pop() ?? script })}</button>
                    ))}
                  </div>
                </div>
              ) : null}
              {editing === rowKey ? (
                <ItemEditor
                  title={item.title}
                  body={item.body}
                  onCancel={() => setEditing(null)}
                  onSave={async (title, body) => {
                    const result = await post({ file: item.file, id: item.id, title, body });
                    if (!result.ok) return result.error;
                    setEditing(null);
                    onChanged();
                    return null;
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
