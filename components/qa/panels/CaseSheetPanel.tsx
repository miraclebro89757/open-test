"use client";

import { useState } from "react";
import { Badge, buttonStyle } from "../qa-ui";
import { useQaData } from "../useQaData";

interface Binding {
  url?: string;
  title?: string;
  lastPushAt?: string;
  lastPullAt?: string;
}

interface SheetPayload {
  binding: Binding | null;
  mcpConfigured: boolean;
  version: string;
  caseCount: number;
}

export function CaseSheetPanel({
  cwd,
  refreshKey,
  onChanged,
}: {
  cwd: string;
  refreshKey: number;
  onChanged: () => void;
}) {
  const { data, error, post } = useQaData<SheetPayload>("/api/qa/case-sheet", cwd, refreshKey);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"push" | "pull" | "">("");
  const binding = data?.binding ?? null;

  async function run(action: "push" | "pull") {
    setBusy(action);
    setMessage("");
    const result = await post({ action, url: url.trim() || binding?.url });
    setBusy("");
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (action === "pull") {
      setMessage(`已收回 ${Number(result.body.updated ?? 0)} 条。${result.body.conflicts ? `${Number(result.body.conflicts)} 条两边都改了，已写入待澄清。` : ""}表格改动记成待确认经验，不会自动启用。`);
    } else {
      setMessage(`已推送 ${Number(result.body.written ?? 0)} 条到个人空间表格。用「需求版本」列筛选评审。`);
    }
    onChanged();
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 12 }}>钉钉表格</strong>
        {binding?.url ? <Badge tone="ok">{binding.title || "已绑定"}</Badge> : <Badge>未绑定</Badge>}
        {data?.version ? <Badge>{data.version}</Badge> : null}
        {data && !data.mcpConfigured ? <Badge tone="bad">未接 dingtalk-excel</Badge> : null}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        推到钉钉个人空间表格做评审。状态只有正常、废弃；模块是用例文件名；执行结果来自最近一次运行。人改完表格后收回。本地 cases/*.md 仍是准。
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={binding?.url || "空白则在个人空间新建表格"}
          aria-label="钉钉表格链接"
          style={{
            flex: 1, minWidth: 160, height: 26, padding: "0 8px", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12,
          }}
        />
        <button type="button" style={buttonStyle("primary", Boolean(busy) || !data?.caseCount)} disabled={Boolean(busy) || !data?.caseCount} onClick={() => void run("push")}>
          {busy === "push" ? "推送中…" : "推到表格"}
        </button>
        <button type="button" style={buttonStyle()} disabled={Boolean(busy) || (!binding?.url && !url.trim())} onClick={() => void run("pull")}>
          {busy === "pull" ? "收回中…" : "从表格收回"}
        </button>
      </div>
      {binding?.url ? (
        <a href={binding.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          打开表格
        </a>
      ) : null}
      {error ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{error}</div> : null}
      {message ? <div role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{message}</div> : null}
    </div>
  );
}
