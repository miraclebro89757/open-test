"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";

interface RulesDocument {
  path: string;
  content: string;
  exists: boolean;
  activeFile: string | null;
}

interface RulesResponse {
  global: RulesDocument;
  project: RulesDocument | null;
  error?: string;
}

function RulesEditor({
  title,
  hint,
  document,
  unavailable = false,
  draft,
  saving,
  saved,
  error,
  onDraft,
  onSave,
}: {
  title: string;
  hint: string;
  document: RulesDocument | null;
  unavailable?: boolean;
  draft: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onDraft: (value: string) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const dirty = document !== null && draft !== document.content;
  const note = document && document.activeFile && document.activeFile !== "AGENTS.md"
    ? t(document.exists ? "settings.rulesShadowed" : "settings.rulesWillReplace", { file: document.activeFile })
    : null;

  return (
    <section className="settings-general-section">
      <h3 className="settings-general-heading">{title}</h3>
      <p className="settings-general-description">{hint}</p>
      {unavailable ? (
        <p className="settings-general-description">{t("settings.rulesNeedProject")}</p>
      ) : document ? (
        <p className="settings-rules-path" title={document.path}>{document.path}</p>
      ) : null}
      {note ? <p className="settings-rules-note">{note}</p> : null}
      {!document?.exists && document ? <p className="settings-general-description">{t("settings.rulesEmpty")}</p> : null}
      <textarea
        className="settings-rules-text"
        value={unavailable ? "" : draft}
        disabled={unavailable || !document || saving}
        spellCheck={false}
        aria-label={title}
        onChange={(event) => onDraft(event.target.value)}
      />
      <div className="settings-rules-actions">
        <button type="button" className="settings-rules-save" disabled={unavailable || !document || !dirty || saving} onClick={onSave}>
          {saving ? t("settings.rulesSaving") : t("settings.rulesSave")}
        </button>
        {saved ? <span className="settings-rules-saved">{t("settings.rulesSaved")}</span> : null}
        {error ? <span className="settings-rules-error">{error}</span> : null}
      </div>
    </section>
  );
}

/** The two AGENTS.md files a web session reads: every project, and this one. */
export function AgentRulesConfig({ cwd }: { cwd: string | null }) {
  const { t } = useI18n();
  const [globalDoc, setGlobalDoc] = useState<RulesDocument | null>(null);
  const [projectDoc, setProjectDoc] = useState<RulesDocument | null>(null);
  const [globalDraft, setGlobalDraft] = useState("");
  const [projectDraft, setProjectDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [globalSaving, setGlobalSaving] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [globalSaved, setGlobalSaved] = useState(false);
  const [projectSaved, setProjectSaved] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
      const response = await fetch(`/api/agent-rules${query}`);
      const data = (await response.json()) as RulesResponse;
      if (!response.ok || !data.global) {
        setLoadError(t("settings.rulesLoadFailed"));
        return;
      }
      setGlobalDoc(data.global);
      setGlobalDraft(data.global.content);
      setProjectDoc(data.project);
      setProjectDraft(data.project?.content ?? "");
    } catch {
      setLoadError(t("settings.rulesLoadFailed"));
    }
  }, [cwd, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (scope: "global" | "project") => {
    const setSaving = scope === "global" ? setGlobalSaving : setProjectSaving;
    const setSaved = scope === "global" ? setGlobalSaved : setProjectSaved;
    const setError = scope === "global" ? setGlobalError : setProjectError;
    const content = scope === "global" ? globalDraft : projectDraft;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/agent-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, content, cwd }),
      });
      const data = (await response.json()) as { rules?: RulesDocument; error?: string };
      if (!response.ok || !data.rules) {
        setError(t("settings.rulesSaveFailed"));
        return;
      }
      if (scope === "global") {
        setGlobalDoc(data.rules);
        setGlobalDraft(data.rules.content);
      } else {
        setProjectDoc(data.rules);
        setProjectDraft(data.rules.content);
      }
      setSaved(true);
    } catch {
      setError(t("settings.rulesSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-general settings-rules">
      <p className="settings-general-description">{t("settings.rulesIntro")}</p>
      {loadError ? <p className="settings-rules-error">{loadError}</p> : null}
      <RulesEditor
        title={t("settings.rulesGlobal")}
        hint={t("settings.rulesGlobalHint")}
        document={globalDoc}
        draft={globalDraft}
        saving={globalSaving}
        saved={globalSaved}
        error={globalError}
        onDraft={(value) => { setGlobalDraft(value); setGlobalSaved(false); }}
        onSave={() => { void save("global"); }}
      />
      <RulesEditor
        title={t("settings.rulesProject")}
        hint={t("settings.rulesProjectHint")}
        unavailable={!cwd}
        document={projectDoc}
        draft={projectDraft}
        saving={projectSaving}
        saved={projectSaved}
        error={projectError}
        onDraft={(value) => { setProjectDraft(value); setProjectSaved(false); }}
        onSave={() => { void save("project"); }}
      />
    </div>
  );
}
