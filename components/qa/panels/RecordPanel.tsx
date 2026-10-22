"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { QaAskAgent } from "@/lib/qa/client";
import { buildRecordRequest, isHttpUrl, type Recording, type RecordMode, type SandboxInfo } from "@/lib/qa/record-request";
import { Badge, EmptyState, QA_COLORS, buttonStyle, formatTime } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";
import { useQaData } from "../useQaData";

interface Props {
  cwd: string;
  refreshKey: number;
  onAskAgent: QaAskAgent;
  onOpenFile: (absolutePath: string) => void;
  onChanged: () => void;
}

interface RecordData {
  sandbox: SandboxInfo;
  cases: Array<{ id: string; title: string }>;
  recordings: Recording[];
}

const MODES: RecordMode[] = ["ui+api", "ui-only", "api-only"];

const fieldStyle = { height: 28, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, padding: "0 8px" } as const;
const labelStyle = { display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" } as const;

/** The recording wizard: pick the case and the mode, then the agent opens the Playwright window. */
export function RecordPanel({ cwd, refreshKey, onAskAgent, onOpenFile, onChanged }: Props) {
  const { t } = useI18n();
  const { data, error, reload, post } = useQaData<RecordData>("/api/qa/record", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [url, setUrl] = useState<string | null>(null);
  const [caseId, setCaseId] = useState("");
  const [mode, setMode] = useState<RecordMode>("ui+api");
  const [cleanupPre, setCleanupPre] = useState(true);
  const [cleanupPost, setCleanupPost] = useState(true);
  const [saveDefault, setSaveDefault] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // A recording lands after the window closes, so look again now and then.
  useEffect(() => {
    const timer = setInterval(() => { void reload(); }, 5000);
    return () => clearInterval(timer);
  }, [reload]);

  if (error) return <EmptyState title={t("qa.record.loadFailed")} hint={error} />;
  if (!data) return <EmptyState title={t("qa.loading")} />;

  const address = (url ?? data.sandbox.url).trim();
  const valid = isHttpUrl(address);
  const absolute = (relative: string) => `${cwd.replace(/\/+$/, "")}/${relative}`;

  const start = async () => {
    setMessage(null);
    if (saveDefault && address !== data.sandbox.url) {
      const saved = await post({ sandboxUrl: address });
      if (!saved.ok) {
        setMessage(saved.error);
        return;
      }
    }
    ask({ mode: "send", text: buildRecordRequest({ sandboxUrl: address, caseId, mode, cleanupPre, cleanupPost }) });
    onChanged();
  };

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <section aria-label={t("qa.record.wizard")} style={{ padding: "12px", display: "grid", gap: 10, borderBottom: "1px solid var(--border)" }}>
        <label style={labelStyle}>
          {t("qa.record.url")}
          <input
            value={url ?? data.sandbox.url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://sandbox.example.com"
            aria-invalid={address.length > 0 && !valid}
            style={{ ...fieldStyle, borderColor: address && !valid ? QA_COLORS.bad : "var(--border)" }}
          />
          <span style={{ fontSize: 11, color: address && !valid ? QA_COLORS.bad : "var(--text-dim)" }}>
            {address && !valid ? t("qa.record.urlInvalid") : t(`qa.record.source.${data.sandbox.source}`)}
          </span>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
          <input type="checkbox" checked={saveDefault} onChange={(event) => setSaveDefault(event.target.checked)} />
          {t("qa.record.saveDefault")}
        </label>

        <label style={labelStyle}>
          {t("qa.record.case")}
          <select value={caseId} onChange={(event) => setCaseId(event.target.value)} style={fieldStyle}>
            <option value="">{t("qa.record.caseAny")}</option>
            {data.cases.map((item) => <option key={item.id} value={item.id}>{item.id} {item.title}</option>)}
          </select>
          {data.cases.length === 0 ? <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("qa.record.noCases")}</span> : null}
        </label>

        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
          <legend style={{ fontSize: 12, color: "var(--text-muted)", padding: 0, marginBottom: 4 }}>{t("qa.record.mode")}</legend>
          <div role="radiogroup" aria-label={t("qa.record.mode")} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MODES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                title={t(`qa.record.mode.${option}`)}
                onClick={() => setMode(option)}
                style={{ ...buttonStyle(mode === option ? "primary" : "plain"), height: 26 }}
              >
                {t(`qa.record.mode.${option}Label`)}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{t(`qa.record.mode.${mode}`)}</span>
        </fieldset>

        <fieldset disabled={mode === "ui-only"} style={{ border: "none", margin: 0, padding: 0, display: "flex", gap: 14, flexWrap: "wrap", opacity: mode === "ui-only" ? 0.45 : 1 }}>
          <legend style={{ fontSize: 12, color: "var(--text-muted)", padding: 0, marginBottom: 4 }}>{t("qa.record.cleanup")}</legend>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={cleanupPre} onChange={(event) => setCleanupPre(event.target.checked)} />{t("qa.record.cleanupPre")}
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={cleanupPost} onChange={(event) => setCleanupPost(event.target.checked)} />{t("qa.record.cleanupPost")}
          </label>
        </fieldset>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={!valid} style={buttonStyle("primary", !valid)} onClick={() => void start()}>{t("qa.record.start")}</button>
          {feedback ? <span role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{feedback}</span> : null}
          {message ? <span role="alert" style={{ fontSize: 12, color: QA_COLORS.bad }}>{message}</span> : null}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>
          {t("qa.record.hint")}
        </div>
      </section>

      <section aria-label={t("qa.record.existing")}>
        <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>{t("qa.record.count", { count: data.recordings.length })}</div>
        {data.recordings.length === 0 ? <EmptyState title={t("qa.record.empty")} hint={t("qa.record.emptyHint")} /> : null}
        {data.recordings.map((recording) => {
          const expanded = open === recording.id;
          const analysis = recording.analysis;
          return (
            <div key={recording.id} style={{ borderTop: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : recording.id)}
                aria-expanded={expanded}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 12.5, textAlign: "left" }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recording.caseId}</span>
                {recording.ui ? <Badge tone="accent">UI</Badge> : null}
                {recording.api ? <Badge tone="ok">API</Badge> : null}
                {analysis ? <Badge tone={analysis.source === "ai" ? "ok" : "warn"} title={analysis.source === "ai" ? t("qa.record.aiTitle") : t("qa.record.rulesTitle")}>{analysis.source === "ai" ? t("qa.record.ai") : analysis.source === "rules" ? t("qa.record.rules") : t("qa.record.analysis")}</Badge> : null}
                <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{recording.recordedAt ? formatTime(recording.recordedAt) : ""}</span>
              </button>
              {expanded ? (
                <div style={{ padding: "0 12px 12px 12px", display: "grid", gap: 8, fontSize: 12 }}>
                  {analysis ? (
                    <>
                      <div style={{ color: "var(--text-muted)" }}>
                        {t("qa.record.stats", { requests: analysis.requests, endpoints: analysis.endpoints, variables: analysis.variables.length, dependencies: analysis.dependencies.length })}
                      </div>
                      {analysis.source !== "ai" ? (
                        <div style={{ color: QA_COLORS.warn }}>{t("qa.record.rough")}</div>
                      ) : null}
                      {analysis.variables.length ? (
                        <div>
                          <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>{t("qa.record.variables")}</div>
                          {analysis.variables.map((variable) => (
                            <div key={variable.name}><code>{variable.name}</code> <span style={{ color: "var(--text-dim)" }}>{t("qa.record.usedIn", { type: variable.type, count: variable.usedIn })}</span></div>
                          ))}
                        </div>
                      ) : null}
                      {analysis.dependencies.length ? (
                        <div>
                          <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>{t("qa.record.dependencies")}</div>
                          {analysis.dependencies.map((dependency) => (
                            <div key={`${dependency.from}-${dependency.to}-${dependency.variable}`}>{t("qa.record.dependency", { from: dependency.from + 1, to: dependency.to + 1 })} <code>{dependency.variable}</code></div>
                          ))}
                        </div>
                      ) : null}
                      {analysis.sensitive.length ? (
                        <div>
                          <div style={{ color: QA_COLORS.warn, marginBottom: 2 }}>{t("qa.record.sensitive")}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {analysis.sensitive.map((item) => <Badge key={item.category} tone="warn">{item.category} ×{item.count}</Badge>)}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div style={{ color: "var(--text-dim)" }}>{recording.api || recording.har ? t("qa.record.noHar") : t("qa.record.uiOnly")}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {([[t("qa.record.uiScript"), recording.ui], [t("qa.record.apiScript"), recording.api], [t("qa.record.env"), recording.env], [t("qa.record.readme"), recording.readme], [t("qa.record.har"), recording.har]] as const)
                      .filter(([, file]) => file)
                      .map(([label, file]) => (
                        <button key={file} type="button" style={{ ...buttonStyle(), height: 24, padding: "0 8px" }} title={file} onClick={() => onOpenFile(absolute(file))}>{label}</button>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
