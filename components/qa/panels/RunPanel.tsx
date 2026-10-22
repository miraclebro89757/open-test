"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { QaAskAgent } from "@/lib/qa/client";
import { STAGE_REQUESTS } from "@/lib/qa/client";
import type { AutomationScript } from "@/lib/qa/assets";
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

/** Run the recorded scripts and read the result of each. Numbers come only from real runs. */
export function RunPanel({ cwd, refreshKey, onAskAgent, onOpenFile, onChanged }: Props) {
  const { t } = useI18n();
  const { data, error, reload, post } = useQaData<{ runs: RunRecord[]; scripts: AutomationScript[] }>("/api/qa/run", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [headed, setHeaded] = useState(false);
  const [retries, setRetries] = useState(0);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const latest = data?.runs[0] ?? null;
  const running = latest?.status === "running";
  const run = (selectedRun && data?.runs.find((item) => item.id === selectedRun)) || latest;

  // Poll while a run is in progress, and tell the shell once it ends so the pipeline bar updates.
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

  const start = async (files?: string[], kind?: "ui" | "api") => {
    setStarting(true);
    setMessage(null);
    setSelectedRun(null);
    const result = await post({ files, kind, headed, retries });
    setStarting(false);
    if (!result.ok) setMessage(result.error);
    else onChanged();
  };

  if (error) return <EmptyState title={t("qa.run.loadFailed")} hint={error} />;
  if (!data) return <EmptyState title={t("qa.loading")} />;

  const uiCount = data.scripts.filter((script) => script.kind === "ui").length;
  const apiCount = data.scripts.filter((script) => script.kind === "api").length;
  if (!data.scripts.length && !data.runs.length) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={running || starting || !data.scripts.length} style={buttonStyle("primary", running || starting)} onClick={() => void start()}>
            {running ? t("qa.run.running") : t("qa.run.all", { count: data.scripts.length })}
          </button>
          <button type="button" disabled={running || starting || !uiCount} style={buttonStyle("plain", running || starting || !uiCount)} onClick={() => void start(undefined, "ui")}>{t("qa.run.ui", { count: uiCount })}</button>
          <button type="button" disabled={running || starting || !apiCount} style={buttonStyle("plain", running || starting || !apiCount)} onClick={() => void start(undefined, "api")}>{t("qa.run.api", { count: apiCount })}</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={headed} onChange={(event) => setHeaded(event.target.checked)} />{t("qa.run.headed")}
          </label>
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
            {run.status === "running" ? t("qa.run.runningNow") : t("qa.run.finished", { time: run.finishedAt ? formatTime(run.finishedAt) : "" })}
          </span>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {!run ? (
          <EmptyState title={t("qa.run.none")} hint={t("qa.run.noneHint")} />
        ) : run.scripts.map((script: RunScript) => {
          const key = `${run.id}#${script.file}`;
          const expanded = open === key;
          const failing = script.status === "failed" || script.status === "error";
          return (
            <div key={key} style={{ borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 12.5 }}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : key)}
                  aria-expanded={expanded}
                  style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, color: "var(--text)", cursor: "pointer", textAlign: "left", fontSize: 12.5 }}
                >
                  <Badge tone={script.kind === "ui" ? "accent" : "ok"}>{script.kind === "ui" ? "UI" : "API"}</Badge>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={script.file}>{script.file.replace(/^automation\//, "")}</span>
                </button>
                {script.caseIds.length ? <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{script.caseIds.join(" ")}</span> : null}
                {script.attempts > 1 ? <Badge tone="warn" title={t("qa.run.retried")}>{t("qa.run.retryBadge", { count: script.attempts - 1 })}</Badge> : null}
                <Badge tone={statusTone(script.status)}>{t(STATUS_KEY[script.status])}</Badge>
                {script.durationMs ? <span style={{ color: "var(--text-dim)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{seconds(script.durationMs)}</span> : null}
              </div>
              {expanded ? (
                <div style={{ padding: "2px 12px 12px 36px", display: "grid", gap: 6 }}>
                  {script.tests.map((test) => (
                    <div key={test.name} style={{ fontSize: 12 }}>
                      <span style={{ color: test.status === "passed" ? QA_COLORS.ok : test.status === "failed" ? QA_COLORS.bad : "var(--text-muted)" }}>
                        {test.status === "passed" ? "✓" : test.status === "failed" ? "✗" : "–"}
                      </span>{" "}
                      {test.name}
                      <span style={{ color: "var(--text-dim)" }}> {seconds(test.durationMs)}</span>
                      {test.message ? <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", fontSize: 11.5, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>{test.message.slice(0, 800)}</pre> : null}
                    </div>
                  ))}
                  {script.error ? <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11.5, color: script.status === "error" ? QA_COLORS.warn : "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" }}>{script.error}</pre> : null}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" style={buttonStyle()} onClick={() => onOpenFile(absolute(script.file))}>{t("qa.openScript")}</button>
                    <button type="button" disabled={running || starting} style={buttonStyle("plain", running || starting)} onClick={() => void start([script.file])}>{t("qa.run.rerun")}</button>
                    {failing && script.kind === "ui" && script.status === "failed" ? (
                      <button
                        type="button"
                        style={buttonStyle("primary")}
                        onClick={() => ask({
                          mode: "send",
                          text: `脚本 ${script.file} 执行失败：${(script.tests.find((test) => test.status === "failed")?.message ?? script.error).split("\n")[0].slice(0, 200)}。如果是选择器失效，用 heal_selector 修复并重新运行这个脚本，告诉我改了哪些选择器；如果是业务失败，不要改脚本，说明可能的缺陷。`,
                        })}
                      >
                        {t("qa.run.heal")}
                      </button>
                    ) : null}
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
