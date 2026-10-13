"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { clarificationSubmitText, STAGE_REQUESTS, type QaAskAgent } from "@/lib/qa/client";
import type { ClarificationItem, ClarificationStatus } from "@/lib/qa/clarification-format";
import { Badge, EmptyState, buttonStyle } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";
import { useQaData } from "../useQaData";
import { SourcePackPanel } from "./SourcePackPanel";

interface Document {
  file: string;
  legacy: boolean;
  items: ClarificationItem[];
}

const ACTIONS: Array<{ status: Exclude<ClarificationStatus, "待处理">; hint: string }> = [
  { status: "忽略", hint: "理解错了，不再提起" },
  { status: "已补充", hint: "写上正确说法" },
  { status: "待讨论", hint: "先搁置，以后再定" },
];

function itemKey(item: ClarificationItem): string {
  return `${item.file}#${item.id}`;
}

function choiceStyle(selected: boolean): CSSProperties {
  return {
    ...buttonStyle(),
    height: 26,
    background: selected ? "var(--accent)" : "var(--bg)",
    color: selected ? "var(--accent-contrast)" : "var(--text)",
    borderColor: selected ? "var(--accent)" : "var(--border)",
  };
}

/** Cards for the single clarification document. Marking writes the same file; nothing is deleted. */
export function ClarificationsPanel({
  cwd,
  refreshKey,
  onAskAgent,
  onOpenFile,
  onChanged,
  file,
  embedded = false,
}: {
  cwd: string;
  refreshKey: number;
  onAskAgent: QaAskAgent;
  onOpenFile: (absolutePath: string) => void;
  onChanged: () => void;
  /** When set, only this knowledge file is shown. Used inside the file preview. */
  file?: string;
  /** Flow with the surrounding document instead of filling the workbench. */
  embedded?: boolean;
}) {
  const { data, error, reload, post } = useQaData<{ documents: Document[]; otherFiles: string[] }>("/api/qa/clarifications", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const rootRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(new Set<string>());
  const draftsRef = useRef<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const active = document.activeElement;
      if (active && rootRef.current?.contains(active) && active instanceof HTMLTextAreaElement) return;
      void reload();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const documents = (data?.documents ?? []).filter((document) => !file || document.file.normalize("NFC") === file.normalize("NFC"));
  const otherFiles = file ? [] : (data?.otherFiles ?? []);
  const items = useMemo(() => documents.flatMap((document) => document.items), [documents]);
  const decided = items.filter((item) => item.status !== "待处理");

  const save = async (item: ClarificationItem, status: ClarificationStatus, supplement: string) => {
    const result = await post({ file: item.file, id: item.id, status, supplement });
    if (!result.ok) {
      setMessage(result.error);
      return false;
    }
    setMessage(null);
    dirty.current.delete(itemKey(item));
    onChanged();
    return true;
  };

  const noteOf = (item: ClarificationItem) => draftsRef.current[itemKey(item)] ?? item.supplement;

  const mark = (item: ClarificationItem, status: Exclude<ClarificationStatus, "待处理">) => {
    const next = item.status === status ? "待处理" : status;
    void save(item, next, noteOf(item));
  };

  const submit = async () => {
    for (const item of items) {
      const key = itemKey(item);
      if (!dirty.current.has(key)) continue;
      const ok = await save(item, item.status, noteOf(item));
      if (!ok) return;
    }
    const incomplete = items.filter((item) => item.status === "已补充" && !noteOf(item).trim());
    if (incomplete.length) {
      setMessage("已补充的条目需要写上补充内容");
      return;
    }
    const files = [...new Set(decided.map((item) => item.file))];
    if (!files.length) return;
    ask({ mode: "send", text: clarificationSubmitText(files) });
  };

  if (error) return <EmptyState title="读取待澄清失败" hint={error} />;
  if (!data) return <EmptyState title="读取中…" />;

  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", height: embedded ? "auto" : "100%", minHeight: embedded ? undefined : 0 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <Badge tone="warn">待处理 {items.filter((item) => item.status === "待处理").length}</Badge>
        <Badge>忽略 {items.filter((item) => item.status === "忽略").length}</Badge>
        <Badge tone="ok">已补充 {items.filter((item) => item.status === "已补充").length}</Badge>
        <Badge tone="accent">待讨论 {items.filter((item) => item.status === "待讨论").length}</Badge>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          style={buttonStyle("primary", decided.length === 0)}
          disabled={decided.length === 0}
          title={decided.length === 0 ? "先标记一条" : "把这些状态发给 Agent"}
          onClick={() => void submit()}
        >
          提交给 Agent
        </button>
        <button type="button" style={buttonStyle()} onClick={() => ask(STAGE_REQUESTS.analysis)}>分析需求文档</button>
      </div>
      <div style={{ padding: "6px 12px", fontSize: 11.5, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
        再点一次已选中的按钮，改回未处理。条目留在文档里，不会被删掉。
      </div>
      {message || feedback ? (
        <div role="status" style={{ padding: "6px 12px", fontSize: 12, color: message ? "var(--qa-bad, #d14343)" : "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
          {message ?? feedback}
        </div>
      ) : null}
      {embedded || file ? null : (
        <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <SourcePackPanel cwd={cwd} refreshKey={refreshKey} onChanged={onChanged} onAskAgent={onAskAgent} />
        </div>
      )}
      <div style={{ flex: embedded ? undefined : 1, minHeight: embedded ? undefined : 0, overflowY: embedded ? "visible" : "auto" }}>
        {documents.length === 0 && otherFiles.length === 0 ? (
          <EmptyState title="还没有待澄清" hint="分析需求时，Agent 会把待澄清写进 knowledge/需求评审.md。标好之后提交，Agent 按忽略、已补充、待讨论继续。" />
        ) : null}
        {documents.map((document) => (
          <section key={document.file}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--bg-panel)", borderBottom: "1px solid var(--border)" }}>
              <h4 style={{ margin: 0, flex: 1, fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)" }}>{document.file}</h4>
              {file ? null : (
                <button
                  type="button"
                  style={{ ...buttonStyle(), height: 24, padding: "0 8px" }}
                  onClick={() => onOpenFile(`${cwd.replace(/[\\/]+$/, "")}/${document.file}`)}
                >
                  打开文档
                </button>
              )}
            </div>
            {document.legacy ? (
              <div style={{ padding: "12px", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
                这一节还是旧格式，页面没法逐条标记。
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    style={buttonStyle()}
                    onClick={() => ask({
                      mode: "send",
                      text: `请把 ${document.file} 里「待澄清问题」一节改成可标记的条目。每条用 ### Q编号 标题，并写 - 状态：待处理、- 原文：、- Agent理解：、- 补充：。不要删掉原来的问题，也不要改已经标过的条目。`,
                    })}
                  >
                    让 Agent 改成可标记的条目
                  </button>
                </div>
              </div>
            ) : null}
            {document.items.map((item, index) => {
              const key = itemKey(item);
              const supplement = drafts[key] ?? item.supplement;
              const showGroup = Boolean(item.group && item.group !== document.items[index - 1]?.group);
              return (
                <article key={key} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                  {showGroup ? (
                    <h3 style={{ margin: "4px 0 8px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{item.group}</h3>
                  ) : null}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                    <span style={{ color: "var(--text-dim)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{item.id}</span>
                    <strong style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{item.title}</strong>
                    <Badge tone={item.status === "待处理" ? "warn" : item.status === "已补充" ? "ok" : item.status === "待讨论" ? "accent" : "muted"}>{item.status}</Badge>
                  </div>
                  {item.source && item.source !== item.title ? <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>原文：{item.source}</p> : null}
                  {item.understanding ? <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>Agent 的理解：{item.understanding}</p> : null}
                  <div role="group" aria-label={`${item.id} 的处理`} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {ACTIONS.map((action) => (
                      <button
                        key={action.status}
                        type="button"
                        aria-pressed={item.status === action.status}
                        data-clarify-action={action.status}
                        title={action.hint}
                        style={choiceStyle(item.status === action.status)}
                        onClick={() => mark(item, action.status)}
                      >
                        {action.status}
                      </button>
                    ))}
                  </div>
                  {item.status === "已补充" ? (
                    <textarea
                      value={supplement}
                      aria-label={`${item.id} 的补充`}
                      placeholder="写上正确说法。Agent 会按这段话继续，不再用原来的理解。"
                      onChange={(event) => {
                        dirty.current.add(key);
                        draftsRef.current[key] = event.target.value;
                        setDrafts((current) => ({ ...current, [key]: event.target.value }));
                      }}
                      onBlur={(event) => {
                        const next = event.relatedTarget;
                        if (next instanceof HTMLElement && next.dataset.clarifyAction) return;
                        if (!dirty.current.has(key)) return;
                        void save(item, "已补充", draftsRef.current[key] ?? supplement);
                      }}
                      style={{
                        display: "block", width: "100%", boxSizing: "border-box", marginTop: 8, minHeight: 64,
                        padding: 8, borderRadius: 6, border: "1px solid var(--border)", resize: "vertical",
                        background: "var(--bg)", color: "var(--text)", fontSize: 12.5, lineHeight: 1.5,
                      }}
                    />
                  ) : null}
                </article>
              );
            })}
          </section>
        ))}
        {otherFiles.length > 0 ? (
          <section>
            <h4 style={{ margin: 0, padding: "8px 12px", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-panel)", borderBottom: "1px solid var(--border)" }}>其他知识文件</h4>
            {otherFiles.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => onOpenFile(`${cwd.replace(/[\\/]+$/, "")}/${file}`)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontSize: 12.5, cursor: "pointer" }}
              >
                {file}
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
