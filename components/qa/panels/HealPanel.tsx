"use client";

import { useState } from "react";
import type { QaAskAgent } from "@/lib/qa/client";
import { STAGE_REQUESTS } from "@/lib/qa/client";
import { changedLines } from "@/lib/qa/diff";
import { Badge, EmptyState, QA_COLORS, buttonStyle } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";
import { useQaData } from "../useQaData";

interface Props {
  cwd: string;
  refreshKey: number;
  onAskAgent: QaAskAgent;
  onOpenFile: (absolutePath: string) => void;
  onChanged: () => void;
}

interface HealItem {
  file: string;
  relativeFile: string;
  before: string;
  after: string;
  oldSelector: string;
  newSelector: string;
  beforeText: string;
  afterText: string;
}

const codeStyle = { margin: 0, padding: "2px 8px", whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 11.5, fontFamily: "var(--font-mono, monospace)" } as const;

/** Self-healed scripts waiting for a decision: keep the repaired selector or go back. */
export function HealPanel({ cwd, refreshKey, onAskAgent, onOpenFile, onChanged }: Props) {
  const { data, error, post } = useQaData<{ entries: HealItem[] }>("/api/qa/heal", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [message, setMessage] = useState<string | null>(null);

  if (error) return <EmptyState title="读取自愈记录失败" hint={error} />;
  if (!data) return <EmptyState title="读取中…" />;

  const decide = async (item: HealItem, keep: "before" | "after") => {
    const result = await post({ before: item.before, keep });
    if (!result.ok) setMessage(result.error);
    else {
      setMessage(null);
      onChanged();
    }
  };

  if (!data.entries.length) {
    return (
      <EmptyState title="没有待确认的自愈" hint="脚本因为选择器失效失败时，Agent 会修复并把前后两个版本留在这里，由你决定留哪一版。">
        <button type="button" style={buttonStyle("primary")} onClick={() => ask(STAGE_REQUESTS.heal)}>让 Agent 检查失败脚本</button>
        {feedback ? <div style={{ marginTop: 8, fontSize: 12 }}>{feedback}</div> : null}
      </EmptyState>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {message ? <div role="alert" style={{ padding: "8px 12px", fontSize: 12, color: QA_COLORS.bad }}>{message}</div> : null}
      {data.entries.map((item) => {
        const changes = changedLines(item.beforeText, item.afterText);
        return (
          <section key={item.before} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.relativeFile}>{item.relativeFile.replace(/^automation\//, "")}</span>
              <Badge tone="warn">待确认</Badge>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              选择器 <code>{item.oldSelector}</code> → <code>{item.newSelector}</code>
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
              {changes.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: "var(--text-dim)" }}>读不到两个版本的内容，版本文件可能被删除。仍可决定保留哪一版。</div>
              ) : changes.slice(0, 12).map((change) => (
                <div key={change.line}>
                  <pre style={{ ...codeStyle, background: "color-mix(in srgb, var(--qa-bad, #d14343) 12%, transparent)" }}>{`- ${change.line}  ${change.before}`}</pre>
                  <pre style={{ ...codeStyle, background: "color-mix(in srgb, var(--qa-ok, #2f9e60) 12%, transparent)" }}>{`+ ${change.line}  ${change.after}`}</pre>
                </div>
              ))}
              {changes.length > 12 ? <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--text-dim)" }}>还有 {changes.length - 12} 处改动</div> : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={buttonStyle("primary")} onClick={() => void decide(item, "after")}>保留自愈后</button>
              <button type="button" style={buttonStyle()} onClick={() => void decide(item, "before")}>恢复自愈前</button>
              <button type="button" style={buttonStyle()} onClick={() => onOpenFile(item.file)}>打开脚本</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
