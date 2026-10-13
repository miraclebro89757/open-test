"use client";

import { useState } from "react";
import { analysisFromPackRequest, type QaAskAgent } from "@/lib/qa/client";
import { Badge, buttonStyle } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";
import { useQaData } from "../useQaData";

interface PackNode {
  nodeId: string;
  title: string;
  role: string;
  extension: string;
  reason?: string;
}

interface PackPayload {
  pack: { root?: { title?: string; url?: string }; ingestedAt?: string; nodes: PackNode[] } | null;
  mcpConfigured: boolean;
}

export function SourcePackPanel({
  cwd,
  refreshKey,
  onChanged,
  onAskAgent,
}: {
  cwd: string;
  refreshKey: number;
  onChanged: () => void;
  onAskAgent?: QaAskAgent;
}) {
  const { data, error, post } = useQaData<PackPayload>("/api/qa/source-pack", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent ?? (() => "unavailable"));
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pack = data?.pack ?? null;
  const nodes = pack?.nodes ?? [];
  const docs = nodes.filter((node) => node.role === "root" || node.role === "linked");
  const unread = nodes.filter((node) => node.role === "unread");

  async function ingest() {
    setBusy(true);
    setMessage("");
    const result = await post({ url: url.trim() || pack?.root?.url });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(`已采集 ${Number(result.body.ingested ?? 0)} 篇。分析时读源包，不必再下载。`);
    onChanged();
  }

  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--bg-panel)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>钉钉需求源包</strong>
        {pack ? <Badge tone="ok">已采集 {docs.length}</Badge> : <Badge>未采集</Badge>}
        {unread.length ? <Badge tone="warn">未读到 {unread.length}</Badge> : null}
        {data && !data.mcpConfigured ? <Badge tone="bad">未接 MCP</Badge> : null}
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        贴根文档链接。系统通过钉钉文档 MCP 采集直接关联文档，写成 knowledge/source-pack/。你不用把嵌套文档下载到本地。
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={pack?.root?.url || "https://alidocs.dingtalk.com/i/nodes/…"}
          style={{
            flex: 1, minWidth: 220, height: 32, padding: "0 10px", borderRadius: 7,
            border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12,
          }}
        />
        <button type="button" style={buttonStyle("primary", busy || (!url.trim() && !pack?.root?.url))} disabled={busy || (!url.trim() && !pack?.root?.url)} onClick={() => void ingest()}>
          {pack ? "重新采集" : "采集"}
        </button>
        {pack && onAskAgent ? (
          <button type="button" style={buttonStyle("plain")} onClick={() => ask(analysisFromPackRequest())}>
            按源包分析
          </button>
        ) : null}
      </div>
      {error ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--qa-bad, #d14343)" }}>{error}</p> : null}
      {message || feedback ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{message || feedback}</p> : null}
      {docs.length ? (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
          {docs.slice(0, 8).map((node) => (
            <li key={node.nodeId || node.title}>{node.role === "root" ? "根文档" : "关联"} · {node.title}</li>
          ))}
          {docs.length > 8 ? <li>另有 {docs.length - 8} 篇</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
