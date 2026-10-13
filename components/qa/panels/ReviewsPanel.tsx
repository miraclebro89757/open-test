"use client";

import { useState, type CSSProperties } from "react";
import { Badge, EmptyState, buttonStyle } from "../qa-ui";
import { useQaData } from "../useQaData";

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
}

interface ReviewKind {
  source: string;
  label: string;
  bulkLabel: string;
  count: number;
  high: number;
  bulkable: number;
}

const KIND_FALLBACK: Record<string, { label: string; bulkLabel: string }> = {
  clarification: { label: "待澄清", bulkLabel: "本类已补充" },
  auto: { label: "经验抽查", bulkLabel: "本类认可" },
  lesson: { label: "待启用经验", bulkLabel: "本类启用" },
  "test-point": { label: "测试点", bulkLabel: "本类确认" },
  case: { label: "用例草稿", bulkLabel: "本类接受" },
  evolution: { label: "版本演进", bulkLabel: "本类按建议处理" },
  heal: { label: "选择器自愈", bulkLabel: "本类留下新选择器" },
  baseline: { label: "应用基线", bulkLabel: "" },
};

const LEVEL_TONE = { L2: "warn", L3: "bad", L4: "bad" } as const;

const fieldStyle: CSSProperties = {
  width: "100%", padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 12, boxSizing: "border-box",
};

function actionsFor(item: ReviewItem): { decision: string; label: string }[] {
  if (item.source === "clarification") {
    return [
      { decision: "忽略", label: "忽略" },
      { decision: "已补充", label: "已补充" },
      { decision: "待讨论", label: "待讨论" },
    ];
  }
  if (item.source === "auto") return [{ decision: "认可", label: "认可" }, { decision: "推翻", label: "推翻" }];
  if (item.source === "lesson") return [{ decision: "启用", label: "启用" }, { decision: "不采纳", label: "不采纳" }];
  if (item.source === "test-point") return [{ decision: "确认", label: "确认" }, { decision: "退回", label: "退回" }];
  if (item.source === "case") return [{ decision: "接受", label: "接受" }, { decision: "退回", label: "退回" }];
  if (item.source === "heal") return [{ decision: "after", label: "留下新选择器" }, { decision: "before", label: "回到旧选择器" }];
  if (item.source === "baseline") return [{ decision: "apply", label: "应用已选" }];
  if (item.suggested === "deprecate") return [{ decision: "deprecate", label: "确认废弃" }, { decision: "defer", label: "暂缓" }, { decision: "keep", label: "仍保留" }];
  if (item.suggested === "update") return [{ decision: "update", label: "标记需更新" }, { decision: "defer", label: "暂缓" }, { decision: "keep", label: "仍保留" }];
  if (item.suggested === "create") return [{ decision: "create", label: "生成候选" }, { decision: "reject", label: "不采纳" }];
  return [{ decision: "keep", label: "保留" }, { decision: "defer", label: "暂缓" }, { decision: "deprecate", label: "废弃" }];
}

function takesNote(item: ReviewItem): boolean {
  return item.source === "clarification" || item.source === "test-point" || item.source === "case";
}

export function ReviewsPanel({ cwd, refreshKey, onChanged }: { cwd: string; refreshKey: number; onChanged: () => void }) {
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
    setMessage(lesson ? `已记成经验 ${lesson.id}（${lesson.scope}）。同类条目会按它处理，可在审核经验里查看或修改。` : "");
    setNote("");
  }

  async function applyKind(source: string, label: string) {
    const body = await run({ action: "accept-kind", source });
    if (!body) return;
    const skipped = Number(body.skipped ?? 0);
    setMessage(`已一键处理「${label}」${Number(body.accepted ?? 0)} 条。${skipped ? `${skipped} 条高风险仍逐条看。` : ""}逐条的忽略、已补充、确认还可以继续用。`);
  }

  if (error) return <EmptyState title="读取待审核失败" hint={error} />;
  if (!data) return <EmptyState title="读取待审核…" />;
  if (!items.length) return <EmptyState title="没有待审核事项" hint="常规生成会继续往下做。只有歧义、高风险变更和还没看过的草稿会出现在这里。" />;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div style={{ width: "46%", minWidth: 240, overflowY: "auto", borderRight: "1px solid var(--border)", padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <Badge tone="bad">高风险 {high}</Badge>
          <Badge>待审核 {items.length}</Badge>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          按任务类型分组。每类有一键处理；点开一条仍可逐条忽略、已补充、确认或退回。L3/L4 不会被一键带走。
        </p>
        <button
          type="button"
          style={buttonStyle("primary", bulk === 0)}
          disabled={bulk === 0}
          onClick={() => void run({ action: "accept-bulk" })}
        >
          处理全部可批量项 {bulk}
        </button>
        {data.blocked.length ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            挡住用例的功能：{data.blocked.join("、")}
          </p>
        ) : null}
        {message ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{message}</p> : null}
        {(kinds.length ? kinds : Object.keys(KIND_FALLBACK).map((source) => ({
          source,
          ...KIND_FALLBACK[source],
          count: items.filter((item) => item.source === source).length,
          high: items.filter((item) => item.source === source && (item.level === "L3" || item.level === "L4")).length,
          bulkable: items.filter((item) => item.source === source && item.bulkEligible).length,
        })).filter((kind) => kind.count > 0)).map((kind) => {
          const rows = items.filter((item) => item.source === kind.source)
            .slice()
            .sort((left, right) => left.level.localeCompare(right.level) * -1);
          if (!rows.length) return null;
          const fallback = KIND_FALLBACK[kind.source];
          const bulkLabel = kind.bulkLabel || fallback?.bulkLabel || "";
          return (
            <section key={kind.source} style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                  {kind.label} {kind.count}
                  {kind.high ? ` · 高风险 ${kind.high}` : ""}
                </h3>
                {bulkLabel && kind.bulkable > 0 && kind.source !== "baseline" ? (
                  <button type="button" style={buttonStyle("primary")} onClick={() => void applyKind(kind.source, kind.label)}>
                    {bulkLabel} {kind.bulkable}
                  </button>
                ) : null}
              </div>
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
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge>{kind.label}</Badge>
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
      <div style={{ flex: 1, overflowY: "auto", padding: 14, fontSize: 12.5, lineHeight: 1.7 }}>
        {selected ? (
          <>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <Badge>{KIND_FALLBACK[selected.source]?.label || selected.source}</Badge>
              <Badge tone={LEVEL_TONE[selected.level]}>{selected.level}</Badge>
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>{selected.title}</h2>
            <p style={{ margin: "0 0 8px" }}>{selected.reason}</p>
            <p style={{ margin: "0 0 8px", color: "var(--text-muted)" }}>影响：{selected.impact}</p>
            <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}><strong>依据</strong><br />{selected.evidence || "没有单独摘出的原文。"}</p>
            <p style={{ margin: "0 0 8px" }}><strong>之前</strong><br />{selected.before}</p>
            <p style={{ margin: "0 0 12px" }}><strong>{selected.source === "auto" ? "Agent 的处理" : "建议"}</strong><br />{selected.after}</p>
            {selected.lessons.map((hint) => (
              <div key={hint.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div>符合经验 <strong>{hint.id}</strong> {hint.title}</div>
                <div style={{ color: "var(--text-muted)" }}>{hint.decision}：{hint.action}</div>
                <button
                  type="button"
                  style={{ ...buttonStyle("primary"), marginTop: 6 }}
                  onClick={() => void decide(selected, `lesson:${hint.id}`)}
                >
                  按经验处理
                </button>
              </div>
            ))}
            {takesNote(selected) ? (
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={selected.source === "clarification" ? "已补充时写上正确说法" : "退回时写上哪里不对"}
                style={{ ...fieldStyle, minHeight: 72, marginBottom: 8, padding: 8 }}
              />
            ) : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {actionsFor(selected).map((action) => (
                <button
                  key={action.decision}
                  type="button"
                  style={buttonStyle(["忽略", "退回", "reject", "推翻", "不采纳"].includes(action.decision) ? "plain" : "primary")}
                  onClick={() => void decide(selected, action.decision)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
