"use client";

import { useState, type CSSProperties } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { Lesson } from "@/lib/qa/lesson-format";
import { Badge, EmptyState, buttonStyle } from "../qa-ui";
import { useQaData } from "../useQaData";
import { storedLabel } from "../text";

const fieldStyle: CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 12, boxSizing: "border-box",
};

const STATUS_TONE = { 已启用: "ok", 待确认: "warn", 停用: "muted" } as const;

export function LessonsPanel({ cwd, refreshKey, onChanged }: { cwd: string; refreshKey: number; onChanged: () => void }) {
  const { t } = useI18n();
  const { data, error, post } = useQaData<{ items: Lesson[] }>("/api/qa/lessons", cwd, refreshKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const items = data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const [draft, setDraft] = useState<Lesson | null>(null);
  const editing = draft && selected && draft.id === selected.id ? draft : selected;

  async function save() {
    if (!editing) return;
    const result = await post({
      action: "update",
      id: editing.id,
      title: editing.title,
      how: editing.action,
      condition: editing.condition,
      keywords: editing.keywords.join("、"),
      scope: editing.scope,
      status: editing.status,
      decision: editing.decision,
    });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const lesson = result.body.lesson as Lesson | undefined;
    setMessage(t("qa.lessons.saved", { id: lesson?.id ?? editing.id }));
    setDraft(null);
    if (lesson?.id) setSelectedId(lesson.id);
    onChanged();
  }

  if (error) return <EmptyState title={t("qa.lessons.loadFailed")} hint={error} />;
  if (!data) return <EmptyState title={t("qa.lessons.loading")} />;
  if (!items.length) {
    return (
      <EmptyState
        title={t("qa.lessons.empty")}
        hint={t("qa.lessons.emptyHint")}
      />
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div style={{ width: "42%", minWidth: 220, overflowY: "auto", borderRight: "1px solid var(--border)", padding: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <Badge>{t("qa.lessons.total", { count: items.length })}</Badge>
          <Badge tone="ok">{t("qa.lessons.enabled", { count: items.filter((item) => item.status === "已启用").length })}</Badge>
        </div>
        {message ? <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)" }}>{message}</p> : null}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setSelectedId(item.id); setDraft(null); }}
            style={{
              display: "block", width: "100%", textAlign: "left", marginBottom: 6, padding: "8px 10px",
              borderRadius: 8, cursor: "pointer", border: "1px solid var(--border)",
              background: selected?.id === item.id ? "var(--bg-selected, var(--bg-panel))" : "var(--bg)",
              color: "var(--text)",
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Badge tone={STATUS_TONE[item.status]}>{storedLabel(t, item.status)}</Badge>
              <Badge>{storedLabel(t, item.scope)}</Badge>
              <strong style={{ fontSize: 12.5 }}>{item.id} {item.title}</strong>
            </div>
            <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-muted)" }}>
              {t("qa.lessons.stats", { target: item.target, hits: item.hits, overturned: item.overturned })}
            </div>
          </button>
        ))}
      </div>
      {editing ? (
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gap: 8, alignContent: "start", fontSize: 12.5 }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>{editing.id}</h2>
          <label>{t("qa.title")}<input style={fieldStyle} value={editing.title} onChange={(event) => setDraft({ ...editing, title: event.target.value })} /></label>
          <label>{t("qa.lessons.keywords")}<input style={fieldStyle} value={editing.keywords.join("、")} onChange={(event) => setDraft({ ...editing, keywords: event.target.value.split(/[、,，]/).map((word) => word.trim()).filter(Boolean) })} /></label>
          <label>{t("qa.lessons.when")}<input style={fieldStyle} value={editing.condition} onChange={(event) => setDraft({ ...editing, condition: event.target.value })} /></label>
          <label>{t("qa.lessons.how")}<textarea style={{ ...fieldStyle, minHeight: 72 }} value={editing.action} onChange={(event) => setDraft({ ...editing, action: event.target.value })} /></label>
          <label>{t("qa.lessons.scope")}
            <select style={fieldStyle} value={editing.scope} onChange={(event) => setDraft({ ...editing, scope: event.target.value as Lesson["scope"] })}>
              <option value="本产品">{t("qa.lessons.scopeProduct")}</option>
              <option value="全部产品">{t("qa.lessons.scopeAll")}</option>
            </select>
          </label>
          <label>{t("qa.lessons.status")}
            <select style={fieldStyle} value={editing.status} onChange={(event) => setDraft({ ...editing, status: event.target.value as Lesson["status"] })}>
              <option value="已启用">{storedLabel(t, "已启用")}</option>
              <option value="待确认">{storedLabel(t, "待确认")}</option>
              <option value="停用">{storedLabel(t, "停用")}</option>
            </select>
          </label>
          <p style={{ margin: 0, color: "var(--text-muted)" }}>{t("qa.lessons.origin", { origin: editing.origin || t("qa.lessons.noOrigin") })}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={buttonStyle("primary")} onClick={() => void save()}>{t("i18n.save")}</button>
            {draft ? <button type="button" style={buttonStyle("plain")} onClick={() => setDraft(null)}>{t("i18n.cancel")}</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
