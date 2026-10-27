"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { QaAskAgent } from "@/lib/qa/client";
import { STAGE_REQUESTS } from "@/lib/qa/client";
import type { RunnableCase } from "@/lib/qa/run-catalog";
import type { RunRecord, RunScript, ScriptStatus } from "@/lib/qa/runs";
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

const STATUS_KEY: Record<ScriptStatus, string> = {
  passed: "qa.run.passedStatus",
  failed: "qa.run.failedStatus",
  skipped: "qa.run.skippedStatus",
  error: "qa.run.errorStatus",
  running: "qa.run.runningStatus",
  pending: "qa.run.pendingStatus",
};

function statusTone(status: ScriptStatus): "ok" | "bad" | "warn" | "accent" | "muted" {
  if (status === "passed") return "ok";
  if (status === "failed") return "bad";
  if (status === "error") return "warn";
  if (status === "running") return "accent";
  return "muted";
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function caseLabel(item: RunnableCase): string {
  const name = [item.caseId, item.title].filter(Boolean).join(" ");
  return name || item.file.split("/").pop() || item.file;
}

/** Pick UI or API cases by name, then run the checked ones in list order. */
export function RunPanel({ cwd, refreshKey, onAskAgent, onOpenFile, onChanged }: Props) {
  const { t } = useI18n();
  const { data, error, reload, post } = useQaData<{ runs: RunRecord[]; cases: RunnableCase[] }>("/api/qa/run", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [filter, setFilter] = useState<"ui" | "api">("ui");
  const [checked, setChecked] = useState<string[]>([]);
  const [headed, setHeaded] = useState(false);
  const [retries, setRetries] = useState(0);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const latest = data?.runs[0] ?? null;
  const running = latest?.status === "running";
  const run = (selectedRun && data?.runs.find((item) => item.id === selectedRun)) || latest;

  const wasRunning = useRef(false);
  useEffect(() => {
    if (running) {
      wasRunning.current = true;
      const timer = setInterval(() => { void reload(); }, 1500);
      return () => clearInterval(timer);
    }
    if (wasRunning.current) {
      wasRunning.current = false;
      onChanged();
    }
    return undefined;
  }, [running, reload, onChanged]);

  const start = async (files: string[]) => {
    setStarting(true);
    setMessage(null);
    setSelectedRun(null);
    const result = await post({ files, headed: filter === "ui" && headed, retries });
    setStarting(false);
    if (!result.ok) setMessage(result.error);
    else onChanged();
  };

  if (error) return <EmptyState title={t("qa.run.loadFailed")} hint={error} />;
  if (!data) return <EmptyState title={t("qa.loading")} />;

  const visible = data.cases.filter((item) => item.kind === filter);
  const selected = visible.filter((item) => checked.includes(item.file));
  const allChecked = visible.length > 0 && visible.every((item) => checked.includes(item.file));
  const uiCount = data.cases.filter((item) => item.kind === "ui").length;
  const apiCount = data.cases.filter((item) => item.kind === "api").length;
  if (!data.cases.length && !data.runs.length) {
    return (
      <EmptyState title={t("qa.run.empty")} hint={t("qa.run.emptyHint")}>
        <button type="button" style={buttonStyle("primary")} onClick={() => ask(STAGE_REQUESTS.record)}>{t("qa.run.goRecord")}</button>
        {feedback ? <div style={{ marginTop: 8, fontSize: 12 }}>{feedback}</div> : null}
      </EmptyState>
    );
  }

  const absolute = (relative: string) => `${cwd.replace(/\/+$/, "")}/${relative}`;
  const selectStyle = { height: 26, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12 } as const;
  const summary = run?.summary;
  const toggle = (file: string) => {
    setChecked((current) => current.includes(file) ? current.filter((item) => item !== file) : [...current, file]);
  };
  const toggleAll = () => {
    const files = visible.map((item) => item.file);
    setChecked((current) => allChecked ? current.filter((file) => !files.includes(file)) : [...new Set([...current, ...files])]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" aria-pressed={filter === "ui"} style={buttonStyle(filter === "ui" ? "primary" : "plain")} onClick={() => setFilter("ui")}>{t("qa.run.filterUi", { count: uiCount })}</button>
          <button type="button" aria-pressed={filter === "api"} style={buttonStyle(filter === "api" ? "primary" : "plain")} onClick={() => setFilter("api")}>{t("qa.run.filterApi", { count: apiCount })}</button>
          <button type="button" disabled={running || starting || !selected.length} style={buttonStyle("primary", running || starting || !selected.length)} onClick={() => void start(selected.map((item) => item.file))}>
            {running ? t("qa.run.running") : t("qa.run.selected", { count: selected.length })}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={allChecked} disabled={!visible.length} onChange={toggleAll} />{t("qa.run.selectAll")}
          </label>
          {filter === "ui" ? (
            <div role="group" aria-label={t("qa.run.headed")} style={{ display: "inline-flex", gap: 6 }}>
              <button type="button" aria-pressed={!headed} title={t("qa.run.headlessHint")} style={buttonStyle(headed ? "plain" : "primary")} onClick={() => setHeaded(false)}>{t("qa.run.headless")}</button>
              <button type="button" aria-pressed={headed} title={t("qa.run.headedHint")} style={buttonStyle(headed ? "primary" : "plain")} onClick={() => setHeaded(true)}>{t("qa.run.headed")}</button>
            </div>
          ) : null}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {t("qa.run.retries")}
            <select value={retries} onChange={(event) => setRetries(Number(event.target.value))} aria-label={t("qa.run.retriesLabel")} style={selectStyle}>
              <option value={0}>{t("qa.run.retry0")}</option>
              <option value={1}>{t("qa.run.retry1")}</option>
              <option value={2}>{t("qa.run.retry2")}</option>
            </select>
          </label>
          {data.runs.length > 1 ? (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
              {t("qa.run.history")}
              <select value={run?.id ?? ""} onChange={(event) => setSelectedRun(event.target.value)} aria-label={t("qa.run.historyLabel")} style={selectStyle}>
                {data.runs.map((item) => <option key={item.id} value={item.id}>{formatTime(item.startedAt)}</option>)}
              </select>
            </label>
          ) : null}
        </div>
        {message ? <div role="alert" style={{ fontSize: 12, color: QA_COLORS.bad }}>{message}</div> : null}
        {feedback ? <div role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{feedback}</div> : null}
      </div>

      {run && summary ? (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 12.5 }} aria-label={t("qa.run.summary")}>
          <span style={{ color: QA_COLORS.ok }}>{t("qa.run.passed", { count: summary.passed })}</span>
          <span style={{ color: summary.failed ? QA_COLORS.bad : "var(--text-muted)" }}>{t("qa.run.failed", { count: summary.failed })}</span>
          <span style={{ color: "var(--text-muted)" }}>{t("qa.run.skipped", { count: summary.skipped })}</span>
          {summary.errors ? <span style={{ color: QA_COLORS.warn }}>{t("qa.run.errors", { count: summary.errors })}</span> : null}
          <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: 11 }}>
            {run.options?.headed ? t("qa.run.headed") : t("qa.run.headless")}
            {" · "}
            {run.status === "running" ? t("qa.run.runningNow") : t("qa.run.finished", { time: run.finishedAt ? formatTime(run.finishedAt) : "" })}
          </span>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {visible.length === 0 ? <EmptyState title={t("qa.run.emptyList")} /> : visible.map((item) => {
          const result: RunScript | undefined = run?.scripts.find((script) => script.file === item.file);
          const key = item.file;
          const expanded = open === key;
          const label = caseLabel(item);
          const detail = item.recordedAt ? formatTime(item.recordedAt) : item.file.split("/").pop();
          return (
            <div key={key} style={{ borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 12.5 }}>
                <input type="checkbox" checked={checked.includes(item.file)} aria-label={label} onChange={() => toggle(item.file)} />
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : key)}
                  aria-expanded={expanded}
                  style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, color: "var(--text)", cursor: "pointer", textAlign: "left", fontSize: 12.5 }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>{label}</span>
                  {detail ? <span style={{ color: "var(--text-dim)", fontSize: 11, flexShrink: 0 }}>{detail}</span> : null}
                </button>
                {result && result.attempts > 1 ? <Badge tone="warn" title={t("qa.run.retried")}>{t("qa.run.retryBadge", { count: result.attempts - 1 })}</Badge> : null}
                {result?.status === "error" && result.error ? <span title={result.error} style={{ color: QA_COLORS.warn, fontSize: 11, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.error.split("\n")[0]}</span> : null}
                {result ? <Badge tone={statusTone(result.status)}>{t(STATUS_KEY[result.status])}</Badge> : null}
                {result?.durationMs ? <span style={{ color: "var(--text-dim)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{seconds(result.durationMs)}</span> : null}
              </div>
              {expanded ? (
                <div style={{ padding: "2px 12px 12px 36px", display: "grid", gap: 6 }}>
                  {result?.tests.map((test) => (
                    <div key={test.name} style={{ fontSize: 12 }}>
                      <span style={{ color: test.status === "passed" ? QA_COLORS.ok : test.status === "failed" ? QA_COLORS.bad : "var(--text-muted)" }}>
                        {test.status === "passed" ? "✓" : test.status === "failed" ? "✗" : "–"}
                      </span>{" "}
                      {test.name}
                      <span style={{ color: "var(--text-dim)" }}> {seconds(test.durationMs)}</span>
                      {test.message ? <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", fontSize: 11.5, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>{test.message.slice(0, 800)}</pre> : null}
                    </div>
                  ))}
                  {result?.error ? <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11.5, color: result.status === "error" ? QA_COLORS.warn : "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>{result.error}</pre> : null}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" style={buttonStyle()} onClick={() => onOpenFile(absolute(item.file))}>{t("qa.openScript")}</button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
