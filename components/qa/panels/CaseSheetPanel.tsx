"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
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
  const { t } = useI18n();
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
      setMessage(t("qa.sheet.pulled", {
        updated: Number(result.body.updated ?? 0),
        conflicts: result.body.conflicts ? t("qa.sheet.conflicts", { count: Number(result.body.conflicts) }) : "",
      }));
    } else {
      setMessage(t("qa.sheet.pushed", { written: Number(result.body.written ?? 0) }));
    }
    onChanged();
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 12 }}>{t("qa.sheet.title")}</strong>
        {binding?.url ? <Badge tone="ok">{binding.title || t("qa.sheet.bound")}</Badge> : <Badge>{t("qa.sheet.unbound")}</Badge>}
        {data?.version ? <Badge>{data.version}</Badge> : null}
        {data && !data.mcpConfigured ? <Badge tone="bad">{t("qa.sheet.noMcp")}</Badge> : null}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        {t("qa.sheet.hint")}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={binding?.url || t("qa.sheet.placeholder")}
          aria-label={t("qa.sheet.url")}
          style={{
            flex: 1, minWidth: 160, height: 26, padding: "0 8px", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12,
          }}
        />
        <button type="button" style={buttonStyle("primary", Boolean(busy) || !data?.caseCount)} disabled={Boolean(busy) || !data?.caseCount} onClick={() => void run("push")}>
          {busy === "push" ? t("qa.sheet.pushing") : t("qa.sheet.push")}
        </button>
        <button type="button" style={buttonStyle()} disabled={Boolean(busy) || (!binding?.url && !url.trim())} onClick={() => void run("pull")}>
          {busy === "pull" ? t("qa.sheet.pulling") : t("qa.sheet.pull")}
        </button>
      </div>
      {binding?.url ? (
        <a href={binding.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {t("qa.sheet.open")}
        </a>
      ) : null}
      {error ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{error}</div> : null}
      {message ? <div role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{message}</div> : null}
    </div>
  );
}
