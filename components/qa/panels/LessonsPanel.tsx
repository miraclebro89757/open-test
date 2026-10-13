"use client";

import { useState, type CSSProperties } from "react";
import type { Lesson } from "@/lib/qa/lesson-format";
import { Badge, EmptyState, buttonStyle } from "../qa-ui";
import { useQaData } from "../useQaData";

const fieldStyle: CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 12, boxSizing: "border-box",
};

const STATUS_TONE = { 已启用: "ok", 待确认: "warn", 停用: "muted" } as const;

export function LessonsPanel({ cwd, refreshKey, onChanged }: { cwd: string; refreshKey: number; onChanged: () => void }) {
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
    setMessage(`已保存 ${lesson?.id ?? editing.id}`);
    setDraft(null);
    if (lesson?.id) setSelectedId(lesson.id);
    onChanged();
  }

  if (error) return <EmptyState title="读取审核经验失败" hint={error} />;
  if (!data) return <EmptyState title="读取审核经验…" />;
  if (!items.length) {
    return (
      <EmptyState
        title="还没有审核经验"
        hint="你在待审核里写的补充和忽略会自动记到这里。文档写法（删除线、以截图为准）记成全部产品，项目规则记在本产品。满 100 条审核记录会合并，避免文件过长。"
      />
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div style={{ width: "42%", minWidth: 220, overflowY: "auto", borderRight: "1px solid var(--border)", padding: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <Badge>共 {items.length} 条</Badge>
          <Badge tone="ok">已启用 {items.filter((item) => item.status === "已启用").length}</Badge>
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
              <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
              <Badge>{item.scope}</Badge>
              <strong style={{ fontSize: 12.5 }}>{item.id} {item.title}</strong>
            </div>
            <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-muted)" }}>
              {item.target} · 命中 {item.hits} · 推翻 {item.overturned}
            </div>
          </button>
        ))}
      </div>
      {editing ? (
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gap: 8, alignContent: "start", fontSize: 12.5 }}>
          <h2 style={{ margin: 0, fontSize: 14 }}>{editing.id}</h2>
          <label>标题<input style={fieldStyle} value={editing.title} onChange={(event) => setDraft({ ...editing, title: event.target.value })} /></label>
          <label>关键词（用顿号分开）<input style={fieldStyle} value={editing.keywords.join("、")} onChange={(event) => setDraft({ ...editing, keywords: event.target.value.split(/[、,，]/).map((word) => word.trim()).filter(Boolean) })} /></label>
          <label>什么情况<input style={fieldStyle} value={editing.condition} onChange={(event) => setDraft({ ...editing, condition: event.target.value })} /></label>
          <label>怎么处理<textarea style={{ ...fieldStyle, minHeight: 72 }} value={editing.action} onChange={(event) => setDraft({ ...editing, action: event.target.value })} /></label>
          <label>范围
            <select style={fieldStyle} value={editing.scope} onChange={(event) => setDraft({ ...editing, scope: event.target.value as Lesson["scope"] })}>
              <option value="本产品">只在这个产品</option>
              <option value="全部产品">所有产品</option>
            </select>
          </label>
          <label>状态
            <select style={fieldStyle} value={editing.status} onChange={(event) => setDraft({ ...editing, status: event.target.value as Lesson["status"] })}>
              <option value="已启用">已启用</option>
              <option value="待确认">待确认</option>
              <option value="停用">停用</option>
            </select>
          </label>
          <p style={{ margin: 0, color: "var(--text-muted)" }}>来源：{editing.origin || "（无）"}。也可以直接改 knowledge/审核经验.md 或 ~/.pi/agent/opentest/审核经验.md。</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={buttonStyle("primary")} onClick={() => void save()}>保存</button>
            {draft ? <button type="button" style={buttonStyle("plain")} onClick={() => setDraft(null)}>取消</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
