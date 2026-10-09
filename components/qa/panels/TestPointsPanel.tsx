"use client";

import { useMemo, useState } from "react";
import type { QaAskAgent } from "@/lib/qa/client";
import { STAGE_REQUESTS } from "@/lib/qa/client";
import type { QaFile, QaItem } from "@/lib/qa/assets";
import { Badge, EmptyState, buttonStyle } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";
import { useQaData } from "../useQaData";
import { ItemEditor } from "./ItemEditor";

interface Props {
  cwd: string;
  refreshKey: number;
  onAskAgent: QaAskAgent;
  /** Called after a change so the pipeline bar and tree re-read. */
  onChanged: () => void;
}

const CONFIRMED = "已确认";

/** Test point review: confirm, reopen and edit points before cases are written. */
export function TestPointsPanel({ cwd, refreshKey, onAskAgent, onChanged }: Props) {
  const { data, error, post } = useQaData<{ files: QaFile[] }>("/api/qa/test-points", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const all = useMemo(() => (data?.files ?? []).flatMap((file) => file.items), [data]);
  const confirmedCount = all.filter((item) => item.status === CONFIRMED).length;
  const key = (item: QaItem) => `${item.file}#${item.id}`;

  const run = async (payload: Record<string, unknown>) => {
    const result = await post(payload);
    if (result.ok) {
      setMessage(null);
      onChanged();
    } else {
      setMessage(result.error);
    }
    return result;
  };

  const confirmSelected = async (action: "confirm" | "unconfirm") => {
    const byFile = new Map<string, string[]>();
    for (const item of all) {
      if (!selected.has(key(item))) continue;
      byFile.set(item.file, [...(byFile.get(item.file) ?? []), item.id]);
    }
    for (const [file, ids] of byFile) await run({ file, action, ids });
    setSelected(new Set());
  };

  if (error) return <EmptyState title="读取测试点失败" hint={error} />;
  if (!data) return <EmptyState title="读取中…" />;
  if (!all.length) {
    return (
      <EmptyState title="还没有测试点" hint="需求分析之后，让 Agent 按功能写测试点，写完会停下来等你确认。">
        <button type="button" style={buttonStyle("primary")} onClick={() => ask(STAGE_REQUESTS["test-points"])}>生成测试点</button>
        {feedback ? <div style={{ marginTop: 8, fontSize: 12 }}>{feedback}</div> : null}
      </EmptyState>
    );
  }

  const allConfirmed = confirmedCount === all.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <Badge tone={allConfirmed ? "ok" : "warn"}>已确认 {confirmedCount}/{all.length}</Badge>
        <span style={{ flex: 1 }} />
        {selected.size ? (
          <>
            <button type="button" style={buttonStyle()} onClick={() => void confirmSelected("confirm")}>确认选中 {selected.size}</button>
            <button type="button" style={buttonStyle()} onClick={() => void confirmSelected("unconfirm")}>重新打开</button>
          </>
        ) : null}
        <button
          type="button"
          style={buttonStyle("plain", allConfirmed)}
          disabled={allConfirmed}
          onClick={async () => { for (const file of data.files) if (file.items.length) await run({ file: file.file, action: "confirm-all" }); }}
        >
          全部确认
        </button>
        <button type="button" style={buttonStyle()} onClick={() => ask({ mode: "compose", text: "请补充这些测试点：" })}>让 Agent 补充</button>
        <button
          type="button"
          style={buttonStyle("primary", confirmedCount === 0)}
          disabled={confirmedCount === 0}
          title={confirmedCount === 0 ? "先确认测试点" : undefined}
          onClick={() => ask(STAGE_REQUESTS.cases)}
        >
          基于已确认生成用例
        </button>
      </div>
      {message || feedback ? (
        <div role="status" style={{ padding: "6px 12px", fontSize: 12, color: message ? "var(--qa-bad, #d14343)" : "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{message ?? feedback}</div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {data.files.filter((file) => file.items.length).map((file) => (
          <section key={file.file}>
            <h4 style={{ margin: 0, padding: "8px 12px", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-panel)", borderBottom: "1px solid var(--border)" }}>
              {file.file}
            </h4>
            {file.items.map((item) => {
              const confirmed = item.status === CONFIRMED;
              const rowKey = key(item);
              return (
                <div key={rowKey} style={{ borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      aria-label={`选择 ${item.id}`}
                      checked={selected.has(rowKey)}
                      onChange={(event) => setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(rowKey); else next.delete(rowKey);
                        return next;
                      })}
                    />
                    <span style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{item.id}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.title}>{item.title}</span>
                    {item.priority ? <Badge>{item.priority}</Badge> : null}
                    <Badge tone={confirmed ? "ok" : "warn"}>{confirmed ? "已确认" : "待确认"}</Badge>
                    <button
                      type="button"
                      style={{ ...buttonStyle(), height: 24, padding: "0 8px" }}
                      onClick={() => void run({ file: item.file, action: confirmed ? "unconfirm" : "confirm", ids: [item.id] })}
                    >
                      {confirmed ? "重新打开" : "确认"}
                    </button>
                    <button type="button" style={{ ...buttonStyle(), height: 24, padding: "0 8px" }} onClick={() => setEditing(editing === rowKey ? null : rowKey)}>编辑</button>
                  </div>
                  {editing === rowKey ? (
                    <ItemEditor
                      title={item.title}
                      body={item.body}
                      note={confirmed ? "改动内容后，这个测试点会回到待确认。" : undefined}
                      onCancel={() => setEditing(null)}
                      onSave={async (title, body) => {
                        const result = await run({ file: item.file, action: "edit", id: item.id, title, body });
                        if (!result.ok) return result.error;
                        setEditing(null);
                        return null;
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
