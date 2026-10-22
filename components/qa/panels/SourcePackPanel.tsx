"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
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
  const { t } = useI18n();
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
    setMessage(t("qa.pack.ingested", { count: Number(result.body.ingested ?? 0) }));
    onChanged();
  }

  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--bg-panel)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>{t("qa.pack.title")}</strong>
        {pack ? <Badge tone="ok">{t("qa.pack.collected", { count: docs.length })}</Badge> : <Badge>{t("qa.pack.none")}</Badge>}
        {unread.length ? <Badge tone="warn">{t("qa.pack.unread", { count: unread.length })}</Badge> : null}
        {data && !data.mcpConfigured ? <Badge tone="bad">{t("qa.pack.noMcp")}</Badge> : null}
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        {t("qa.pack.hint")}
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
          {pack ? t("qa.pack.again") : t("qa.pack.collect")}
        </button>
        {pack && onAskAgent ? (
          <button type="button" style={buttonStyle("plain")} onClick={() => ask(analysisFromPackRequest())}>
            {t("qa.pack.analyze")}
          </button>
        ) : null}
      </div>
      {error ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--qa-bad, #d14343)" }}>{error}</p> : null}
      {message || feedback ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{message || feedback}</p> : null}
      {docs.length ? (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
          {docs.slice(0, 8).map((node) => (
            <li key={node.nodeId || node.title}>{node.role === "root" ? t("qa.pack.root") : t("qa.pack.linked")} · {node.title}</li>
          ))}
          {docs.length > 8 ? <li>{t("qa.pack.more", { count: docs.length - 8 })}</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
