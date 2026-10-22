"use client";

import { useState, type CSSProperties } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Badge, EmptyState, buttonStyle } from "../qa-ui";
import { useQaData } from "../useQaData";
import { decisionLabel, kindBulkLabel, kindLabel, storedLabel } from "../text";

interface LessonHint {
  id: string;
  title: string;
  decision: string;
  action: string;
}

interface ReviewItem {
  id: string;
  source: string;
  title: string;
  feature: string;
  level: "L2" | "L3" | "L4";
  group: "required" | "lesson" | "auto" | "sample" | "bulk";
  reason: string;
  evidence: string;
  before: string;
  after: string;
  impact: string;
  blocking: boolean;
  bulkEligible: boolean;
  suggested: string;
  itemId: string;
  fingerprint: string;
  lessons: LessonHint[];
  requirementVersion?: string;
}

interface ReviewKind {
  source: string;
  label: string;
  bulkLabel: string;
  count: number;
  high: number;
  bulkable: number;
}

const KIND_SOURCES = ["clarification", "auto", "lesson", "test-point", "case", "evolution", "heal", "baseline"];

const LEVEL_TONE = { L2: "warn", L3: "bad", L4: "bad" } as const;

const fieldStyle: CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 12, boxSizing: "border-box",
};

function actionsFor(item: ReviewItem): string[] {
  if (item.source === "clarification") return ["忽略", "已补充", "待讨论"];
  if (item.source === "auto") return ["认可", "推翻"];
  if (item.source === "lesson") return ["启用", "不采纳"];
  if (item.source === "test-point") return ["确认", "退回"];
  if (item.source === "case") return ["接受", "退回"];
  if (item.source === "heal") return ["after", "before"];
  if (item.source === "baseline") return ["apply"];
  if (item.suggested === "deprecate") return ["deprecate", "defer", "keep"];
  if (item.suggested === "update") return ["update", "defer", "keep"];
  if (item.suggested === "create") return ["create", "reject"];
  return ["keep", "defer", "deprecate"];
}

function takesNote(item: ReviewItem): boolean {
  return item.source === "clarification" || item.source === "test-point" || item.source === "case";
}

function ReviewRow({
  item,
  kindLabel,
  selected,
  onSelect,
}: {
  item: ReviewItem;
  kindLabel: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "block", width: "100%", textAlign: "left", marginBottom: 6, padding: "8px 10px",
        borderRadius: 8, cursor: "pointer",
        border: "1px solid var(--border)",
        background: selected ? "var(--bg-selected, var(--bg-panel))" : "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Badge>{kindLabel}</Badge>
        <Badge tone={LEVEL_TONE[item.level]}>{item.level}</Badge>
        {item.requirementVersion ? <Badge>{item.requirementVersion}</Badge> : null}
        <strong style={{ fontSize: 12.5, fontWeight: 600 }}>{item.title}</strong>
      </div>
      <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-muted)" }}>{item.feature} · {item.reason}</div>
    </button>
  );
}

export function ReviewsPanel({ cwd, refreshKey, onChanged }: { cwd: string; refreshKey: number; onChanged: () => void }) {
  const { t } = useI18n();
  const { data, error, post } = useQaData<{ items: ReviewItem[]; blocked: string[]; kinds?: ReviewKind[] }>("/api/qa/reviews", cwd, refreshKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const items = data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const kinds = data?.kinds ?? [];
  const bulk = items.filter((item) => item.bulkEligible).length;
  const high = items.filter((item) => item.level === "L3" || item.level === "L4").length;

  async function run(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const result = await post(payload);
    if (!result.ok) {
      setMessage(result.error);
      return null;
    }
    setMessage("");
    onChanged();
    return result.body;
  }

  async function decide(item: ReviewItem, decision: string) {
    if (item.source === "baseline") {
      await run({ action: "apply-baseline" });
      return;
    }
    const body = await run({ action: "decide", id: item.id, decision, note, fingerprint: item.fingerprint });
    if (!body) return;
    const lesson = body.lesson as { id: string; scope: string } | null;
    setMessage(lesson ? t("qa.review.lessonSaved", { id: lesson.id, scope: storedLabel(t, lesson.scope) }) : "");
    setNote("");
  }

  async function applyKind(source: string, label: string, version?: string) {
    const body = await run({ action: "accept-kind", source, ...(version ? { version } : {}) });
    if (!body) return;
    const skipped = Number(body.skipped ?? 0);
    const versionNote = version ? `（${storedLabel(t, version)}）` : "";
    setMessage(t("qa.review.kindDone", {
      label,
      version: versionNote,
      accepted: Number(body.accepted ?? 0),
      skipped: skipped ? t("qa.review.skippedHigh", { count: skipped }) : "",
      follow: t("qa.review.follow"),
    }));
  }

  if (error) return <EmptyState title={t("qa.review.loadFailed")} hint={error} />;
  if (!data) return <EmptyState title={t("qa.review.loading")} />;
  if (!items.length) return <EmptyState title={t("qa.review.empty")} hint={t("qa.review.emptyHint")} />;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div style={{ width: "46%", minWidth: 240, overflowY: "auto", borderRight: "1px solid var(--border)", padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <Badge tone="bad">{t("qa.highRisk", { count: high })}</Badge>
          <Badge>{t("qa.pendingReview", { count: items.length })}</Badge>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          {t("qa.review.intro")}
        </p>
        <button
          type="button"
          style={buttonStyle("primary", bulk === 0)}
          disabled={bulk === 0}
          onClick={() => void run({ action: "accept-bulk" })}
        >
          {t("qa.review.bulk", { count: bulk })}
        </button>
        {data.blocked.length ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            {t("qa.review.blocked", { names: data.blocked.join("、") })}
          </p>
        ) : null}
        {message ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{message}</p> : null}
        {(kinds.length ? kinds : KIND_SOURCES.map((source) => ({
          source,
          label: kindLabel(t, source),
          bulkLabel: kindBulkLabel(t, source),
          count: items.filter((item) => item.source === source).length,
          high: items.filter((item) => item.source === source && (item.level === "L3" || item.level === "L4")).length,
          bulkable: items.filter((item) => item.source === source && item.bulkEligible).length,
        })).filter((kind) => kind.count > 0)).map((kind) => {
          const rows = items.filter((item) => item.source === kind.source)
            .slice()
            .sort((left, right) => left.level.localeCompare(right.level) * -1);
          if (!rows.length) return null;
          const label = kindLabel(t, kind.source);
          const bulkLabel = kindBulkLabel(t, kind.source);
          const versionGroups = kind.source === "case"
            ? [...new Set(rows.map((item) => item.requirementVersion || "未标明"))]
            : [];
          return (
            <section key={kind.source} style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                  {label} {kind.count}
                  {kind.high ? t("qa.review.highSuffix", { count: kind.high }) : ""}
                </h3>
                {bulkLabel && kind.bulkable > 0 && kind.source !== "baseline" ? (
                  <button type="button" style={buttonStyle("primary")} onClick={() => void applyKind(kind.source, label)}>
                    {bulkLabel} {kind.bulkable}
                  </button>
                ) : null}
              </div>
              {versionGroups.length > 1 ? versionGroups.map((version) => {
                const grouped = rows.filter((item) => (item.requirementVersion || "未标明") === version);
                const bulkable = grouped.filter((item) => item.bulkEligible).length;
                return (
                  <div key={version} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <Badge>{storedLabel(t, version)}</Badge>
                      {bulkLabel && bulkable > 0 ? (
                        <button type="button" style={buttonStyle()} onClick={() => void applyKind(kind.source, label, version)}>
                          {storedLabel(t, version)} {bulkLabel} {bulkable}
                        </button>
                      ) : null}
                    </div>
                    {grouped.map((item) => (
                      <ReviewRow key={item.id} item={item} kindLabel={label} selected={selected?.id === item.id} onSelect={() => { setSelectedId(item.id); setNote(""); }} />
                    ))}
                  </div>
                );
              }) : rows.map((item) => (
                <ReviewRow key={item.id} item={item} kindLabel={label} selected={selected?.id === item.id} onSelect={() => { setSelectedId(item.id); setNote(""); }} />
              ))}
            </section>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14, fontSize: 12.5, lineHeight: 1.7 }}>
        {selected ? (
          <>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <Badge>{kindLabel(t, selected.source)}</Badge>
              <Badge tone={LEVEL_TONE[selected.level]}>{selected.level}</Badge>
              {selected.requirementVersion ? <Badge>{selected.requirementVersion}</Badge> : null}
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>{selected.title}</h2>
            <p style={{ margin: "0 0 8px" }}>{selected.reason}</p>
            <p style={{ margin: "0 0 8px", color: "var(--text-muted)" }}>{t("qa.review.impact", { text: selected.impact })}</p>
            <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}><strong>{t("qa.review.evidence")}</strong><br />{selected.evidence || t("qa.review.noEvidence")}</p>
            <p style={{ margin: "0 0 8px" }}><strong>{t("qa.review.before")}</strong><br />{selected.before}</p>
            <p style={{ margin: "0 0 12px" }}><strong>{selected.source === "auto" ? t("qa.review.agentDid") : t("qa.review.suggestion")}</strong><br />{selected.after}</p>
            {selected.lessons.map((hint) => (
              <div key={hint.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div>{t("qa.review.matchesLesson", { id: hint.id, title: hint.title })}</div>
                <div style={{ color: "var(--text-muted)" }}>{hint.decision}：{hint.action}</div>
                <button
                  type="button"
                  style={{ ...buttonStyle("primary"), marginTop: 6 }}
                  onClick={() => void decide(selected, `lesson:${hint.id}`)}
                >
                  {t("qa.review.applyLesson")}
                </button>
              </div>
            ))}
            {takesNote(selected) ? (
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={selected.source === "clarification" ? t("qa.review.noteClarify") : t("qa.review.noteReturn")}
                style={{ ...fieldStyle, minHeight: 72, marginBottom: 8, padding: 8 }}
              />
            ) : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {actionsFor(selected).map((decision) => (
                <button
                  key={decision}
                  type="button"
                  style={buttonStyle(["忽略", "退回", "reject", "推翻", "不采纳"].includes(decision) ? "plain" : "primary")}
                  onClick={() => void decide(selected, decision)}
                >
                  {decision === "keep" && !["deprecate", "update"].includes(selected.suggested) ? t("qa.assetAction.keep") : decision === "deprecate" && !["deprecate", "update", "create"].includes(selected.suggested) ? t("qa.decision.deprecate") : decisionLabel(t, decision)}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
