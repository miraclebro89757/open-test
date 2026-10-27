"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { QaAskAgent } from "@/lib/qa/client";
import { isHttpUrl, type SandboxInfo } from "@/lib/qa/record-request";
import { EmptyState, QA_COLORS, buttonStyle, formatTime } from "../qa-ui";
import { useQaData } from "../useQaData";

interface Props {
  cwd: string;
  refreshKey: number;
  onAskAgent: QaAskAgent;
  onOpenFile: (absolutePath: string) => void;
  onChanged: () => void;
}

interface UiCapture {
  id: string;
  caseId: string;
  title: string;
  recordedAt: string;
  actions: number;
  file: string;
}

interface CaptureJob {
  status: "recording" | "done" | "error";
  message: string;
}

interface RecordData {
  sandbox: SandboxInfo;
  cases: Array<{ id: string; title: string }>;
  captures: UiCapture[];
  capture: CaptureJob | null;
}

const fieldStyle = { height: 28, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, padding: "0 8px" } as const;
const labelStyle = { display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" } as const;

/** UI capture only. The button opens Chrome directly and writes recordings/, not a script. */
export function RecordPanel({ cwd, refreshKey, onOpenFile, onChanged }: Props) {
  const { t } = useI18n();
  const { data, error, reload, post } = useQaData<RecordData>("/api/qa/record", cwd, refreshKey);
  const [url, setUrl] = useState<string | null>(null);
  const [caseId, setCaseId] = useState("");
  const [saveDefault, setSaveDefault] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => { void reload(); }, 5000);
    return () => clearInterval(timer);
  }, [reload]);

  if (error) return <EmptyState title={t("qa.record.loadFailed")} hint={error} />;
  if (!data) return <EmptyState title={t("qa.loading")} />;

  const address = (url ?? data.sandbox.url).trim();
  const valid = isHttpUrl(address);
  const capturing = data.capture?.status === "recording";
  const absolute = (relative: string) => `${cwd.replace(/\/+$/, "")}/${relative}`;

  const start = async () => {
    setMessage(null);
    const saved = await post({ action: "capture", sandboxUrl: address, caseId, saveDefault });
    if (!saved.ok) {
      setMessage(saved.error);
      return;
    }
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

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={!valid || capturing} style={buttonStyle("primary", !valid || capturing)} onClick={() => void start()}>{t("qa.record.start")}</button>
          {capturing ? <span role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("qa.record.capturing")}</span> : null}
          {message ? <span role="alert" style={{ fontSize: 12, color: QA_COLORS.bad }}>{message}</span> : null}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>
          {t("qa.record.hint")}
        </div>
      </section>

      <section aria-label={t("qa.record.existing")}>
        <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>{t("qa.record.count", { count: data.captures.length })}</div>
        {data.captures.length === 0 ? <EmptyState title={t("qa.record.empty")} hint={t("qa.record.emptyHint")} /> : null}
        {data.captures.map((capture) => (
          <div key={capture.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: 12.5 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {capture.caseId ? `${capture.caseId} ${capture.title}` : capture.id}
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{t("qa.record.actions", { count: capture.actions })}</span>
            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{capture.recordedAt ? formatTime(capture.recordedAt) : ""}</span>
            <button type="button" style={{ ...buttonStyle(), height: 24, padding: "0 8px" }} onClick={() => onOpenFile(absolute(capture.file))}>{t("qa.record.openCapture")}</button>
          </div>
        ))}
      </section>
    </div>
  );
}
