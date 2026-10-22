"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { buttonStyle } from "../qa-ui";

interface Props {
  title: string;
  body: string;
  /** Resolves to an error message, or null when saved. */
  onSave: (title: string, body: string) => Promise<string | null>;
  onCancel: () => void;
  /** Shown above the buttons, e.g. "保存后需要重新确认". */
  note?: string;
}

/** Edits the heading and the lines under it as plain text, so nothing the agent wrote is lost. */
export function ItemEditor({ title, body, onSave, onCancel, note }: Props) {
  const { t } = useI18n();
  const [titleValue, setTitleValue] = useState(title);
  const [bodyValue, setBodyValue] = useState(body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = titleValue !== title || bodyValue !== body;

  const save = async () => {
    setSaving(true);
    const failure = await onSave(titleValue, bodyValue);
    setSaving(false);
    if (failure) setError(failure);
  };

  return (
    <div style={{ display: "grid", gap: 8, padding: "10px 12px", background: "var(--bg-subtle)", borderTop: "1px solid var(--border)" }}>
      <input
        value={titleValue}
        onChange={(event) => setTitleValue(event.target.value)}
        aria-label={t("qa.title")}
        style={{ height: 28, padding: "0 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5 }}
      />
      <textarea
        value={bodyValue}
        onChange={(event) => setBodyValue(event.target.value)}
        aria-label={t("qa.body")}
        rows={Math.min(14, Math.max(5, bodyValue.split("\n").length + 1))}
        spellCheck={false}
        style={{
          padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
          fontSize: 12, lineHeight: 1.6, fontFamily: "var(--font-mono, monospace)", resize: "vertical",
        }}
      />
      {note ? <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{note}</div> : null}
      {error ? <div role="alert" style={{ fontSize: 12, color: "var(--qa-bad, #d14343)" }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={buttonStyle("primary", saving || !dirty)} disabled={saving || !dirty} onClick={() => void save()}>{saving ? t("i18n.saving") : t("i18n.save")}</button>
        <button type="button" style={buttonStyle()} onClick={onCancel}>{t("i18n.cancel")}</button>
      </div>
    </div>
  );
}
