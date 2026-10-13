"use client";

import { useState } from "react";
import { Badge, EmptyState, buttonStyle } from "../qa-ui";
import { useQaData } from "../useQaData";

interface ReviewItem {
  id: string;
  source: string;
  title: string;
  feature: string;
  level: "L2" | "L3" | "L4";
  group: "required" | "sample" | "bulk";
  reason: string;
  evidence: string;
  before: string;
  after: string;
  impact: string;
  blocking: boolean;
  bulkEligible: boolean;
  suggested: string;
  fingerprint: string;
}

const GROUP_LABEL = {
  required: "必须逐项看",
  sample: "建议抽样",
  bulk: "可以批量处理",
} as const;

const LEVEL_TONE = { L2: "warn", L3: "bad", L4: "bad" } as const;

function actionsFor(item: ReviewItem): { decision: string; label: string }[] {
  if (item.source === "clarification") {
    return [
      { decision: "忽略", label: "忽略" },
      { decision: "已补充", label: "已补充" },
      { decision: "待讨论", label: "待讨论" },
    ];
  }
  if (item.source === "test-point") return [{ decision: "确认", label: "确认" }, { decision: "退回", label: "退回" }];
  if (item.source === "case") return [{ decision: "接受", label: "接受" }, { decision: "退回", label: "退回" }];
  if (item.source === "heal") return [{ decision: "after", label: "留下新选择器" }, { decision: "before", label: "回到旧选择器" }];
  if (item.source === "baseline") return [{ decision: "apply", label: "应用已选" }];
  if (item.suggested === "deprecate") return [{ decision: "deprecate", label: "确认废弃" }, { decision: "defer", label: "暂缓" }, { decision: "keep", label: "仍保留" }];
  if (item.suggested === "update") return [{ decision: "update", label: "标记需更新" }, { decision: "defer", label: "暂缓" }, { decision: "keep", label: "仍保留" }];
  if (item.suggested === "create") return [{ decision: "create", label: "生成候选" }, { decision: "reject", label: "不采纳" }];
  return [{ decision: "keep", label: "保留" }, { decision: "defer", label: "暂缓" }, { decision: "deprecate", label: "废弃" }];
}

export function ReviewsPanel({ cwd, refreshKey, onChanged }: { cwd: string; refreshKey: number; onChanged: () => void }) {
  const { data, error, post } = useQaData<{ items: ReviewItem[]; blocked: string[] }>("/api/qa/reviews", cwd, refreshKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const items = data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const bulk = items.filter((item) => item.bulkEligible).length;
  const excluded = items.length - bulk;

  async function run(payload: Record<string, unknown>) {
    const result = await post(payload);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage("");
    setNote("");
    onChanged();
  }

  if (error) return <EmptyState title="读取待审核失败" hint={error} />;
  if (!data) return <EmptyState title="读取待审核…" />;
  if (!items.length) return <EmptyState title="没有待审核事项" hint="常规生成会继续往下做。只有歧义、高风险变更和还没看过的草稿会出现在这里。" />;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div style={{ width: "46%", minWidth: 240, overflowY: "auto", borderRight: "1px solid var(--border)", padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <Badge tone="bad">高风险 {items.filter((item) => item.level === "L3" || item.level === "L4").length}</Badge>
          <Badge>待审核 {items.length}</Badge>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          全部接受 {bulk} 项，排除 {excluded} 项高风险和需要单独决定的事项。
        </p>
        <button
          type="button"
          style={buttonStyle("primary", bulk === 0)}
          disabled={bulk === 0}
          onClick={() => void run({ action: "accept-bulk" })}
        >
          全部接受
        </button>
        {data.blocked.length ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            挡住用例的功能：{data.blocked.join("、")}
          </p>
        ) : null}
        {message ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--qa-bad, #d14343)" }}>{message}</p> : null}
        {(["required", "sample", "bulk"] as const).map((group) => {
          const rows = items.filter((item) => item.group === group);
          if (!rows.length) return null;
          return (
            <section key={group} style={{ marginTop: 14 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-muted)" }}>{GROUP_LABEL[group]}</h3>
              {rows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setSelectedId(item.id); setNote(""); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left", marginBottom: 6, padding: "8px 10px",
                    borderRadius: 8, cursor: "pointer",
                    border: "1px solid var(--border)",
                    background: selected?.id === item.id ? "var(--bg-selected, var(--bg-panel))" : "var(--bg)",
                    color: "var(--text)",
                  }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Badge tone={LEVEL_TONE[item.level]}>{item.level}</Badge>
                    <strong style={{ fontSize: 12.5, fontWeight: 600 }}>{item.title}</strong>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-muted)" }}>{item.feature} · {item.reason}</div>
                </button>
              ))}
            </section>
          );
        })}
      </div>
      {selected ? (
        <div style={{ flex: 1, overflowY: "auto", padding: 14, fontSize: 12.5, lineHeight: 1.7 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>{selected.title}</h2>
          <p style={{ margin: "0 0 8px" }}>{selected.reason}</p>
          <p style={{ margin: "0 0 8px", color: "var(--text-muted)" }}>影响：{selected.impact}</p>
          <p style={{ margin: "0 0 8px" }}><strong>依据</strong><br />{selected.evidence || "没有单独摘出的原文。"}</p>
          <p style={{ margin: "0 0 8px" }}><strong>之前</strong><br />{selected.before}</p>
          <p style={{ margin: "0 0 12px" }}><strong>建议</strong><br />{selected.after}</p>
          {selected.source === "clarification" || selected.suggested === "退回" || selected.source === "test-point" || selected.source === "case" ? (
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={selected.source === "clarification" ? "已补充时写上正确说法" : "退回时写上哪里不对"}
              style={{ width: "100%", minHeight: 72, marginBottom: 8, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {actionsFor(selected).map((action) => (
              <button
                key={action.decision}
                type="button"
                style={buttonStyle(action.decision === "忽略" || action.decision === "退回" || action.decision === "reject" ? "plain" : "primary")}
                onClick={() => void run(selected.source === "baseline"
                  ? { action: "apply-baseline" }
                  : { action: "decide", id: selected.id, decision: action.decision, note, fingerprint: selected.fingerprint })}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
