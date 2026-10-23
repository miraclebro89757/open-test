"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useI18n } from "@/hooks/useI18n";
import { ChevronIcon } from "./SidebarIcons";
import { markdownPreviewRehypePlugins, markdownPreviewRemarkPlugins } from "@/lib/markdown";

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

type RulesScope = "global" | "project";
type RulesMode = "preview" | "edit";

const RULES_FILENAME = "AGENTS.md";

function shadowNote(document: RulesDocument | null, t: (key: string, values?: Record<string, string | number>) => string): string | null {
  if (!document?.activeFile || document.activeFile === RULES_FILENAME) return null;
  return t(document.exists ? "settings.rulesShadowed" : "settings.rulesWillReplace", { file: document.activeFile });
}

/** The two AGENTS.md files a web session reads. Each one opens as a markdown file. */
export function AgentRulesConfig({ cwd }: { cwd: string | null }) {
  const { t } = useI18n();
  const [globalDoc, setGlobalDoc] = useState<RulesDocument | null>(null);
  const [projectDoc, setProjectDoc] = useState<RulesDocument | null>(null);
  const [globalDraft, setGlobalDraft] = useState("");
  const [projectDraft, setProjectDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openScope, setOpenScope] = useState<RulesScope | null>(null);
  const [mode, setMode] = useState<RulesMode>("preview");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const document = openScope === "global" ? globalDoc : openScope === "project" ? projectDoc : null;
  const draft = openScope === "global" ? globalDraft : projectDraft;
  const dirty = document !== null && draft !== document.content;

  const openFile = (scope: RulesScope, file: RulesDocument) => {
    setOpenScope(scope);
    setMode(file.content.trim() ? "preview" : "edit");
    setSaved(false);
    setSaveError(null);
  };

  const save = async () => {
    if (!openScope || !document) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const response = await fetch("/api/agent-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: openScope, content: draft, cwd }),
      });
      const data = (await response.json()) as { rules?: RulesDocument; error?: string };
      if (!response.ok || !data.rules) {
        setSaveError(t("settings.rulesSaveFailed"));
        return;
      }
      if (openScope === "global") {
        setGlobalDoc(data.rules);
        setGlobalDraft(data.rules.content);
      } else {
        setProjectDoc(data.rules);
        setProjectDraft(data.rules.content);
      }
      setSaved(true);
    } catch {
      setSaveError(t("settings.rulesSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (openScope && document) {
    const note = shadowNote(document, t);
    return (
      <div className="settings-general settings-rules is-open">
        <button type="button" className="settings-rules-back" onClick={() => setOpenScope(null)}>
          <ChevronIcon size={14} className="settings-rules-back-icon" />
          <span>{t("settings.rulesBack")}</span>
        </button>
        <div className="settings-rules-filebar">
          <h3 className="settings-rules-filename">{RULES_FILENAME}</h3>
          <span className="settings-rules-scope">{t(openScope === "global" ? "settings.rulesGlobal" : "settings.rulesProject")}</span>
          <div className="file-viewer-mode-switch" aria-label={RULES_FILENAME}>
            <button
              type="button"
              className="file-viewer-mode-button"
              aria-pressed={mode === "preview"}
              style={{ background: mode === "preview" ? "var(--bg-selected)" : "transparent", color: mode === "preview" ? "var(--text)" : "var(--text-muted)" }}
              onClick={() => setMode("preview")}
            >
              {t("i18n.preview")}
            </button>
            <button
              type="button"
              className="file-viewer-mode-button"
              aria-pressed={mode === "edit"}
              style={{ background: mode === "edit" ? "var(--bg-selected)" : "transparent", color: mode === "edit" ? "var(--text)" : "var(--text-muted)" }}
              onClick={() => setMode("edit")}
            >
              {t("settings.rulesEdit")}
            </button>
          </div>
          <button type="button" className="settings-rules-save" disabled={!dirty || saving} onClick={() => { void save(); }}>
            {saving ? t("settings.rulesSaving") : t("settings.rulesSave")}
          </button>
          {saved ? <span className="settings-rules-saved">{t("settings.rulesSaved")}</span> : null}
          {saveError ? <span className="settings-rules-error">{saveError}</span> : null}
        </div>
        <p className="settings-rules-path" title={document.path}>{document.path}</p>
        {note ? <p className="settings-rules-note">{note}</p> : null}
        <div className="settings-rules-sheet">
          {mode === "preview" ? (
            draft.trim() ? (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={markdownPreviewRemarkPlugins} rehypePlugins={markdownPreviewRehypePlugins}>
                  {draft}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="settings-rules-blank">{t("settings.rulesEmpty")}</p>
            )
          ) : (
            <textarea
              className="settings-rules-editor"
              value={draft}
              disabled={saving}
              spellCheck={false}
              aria-label={RULES_FILENAME}
              onChange={(event) => {
                const value = event.target.value;
                if (openScope === "global") setGlobalDraft(value);
                else setProjectDraft(value);
                setSaved(false);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  const rows: Array<{ scope: RulesScope; title: string; hint: string; file: RulesDocument | null; unavailable?: boolean }> = [
    { scope: "global", title: t("settings.rulesGlobal"), hint: t("settings.rulesGlobalHint"), file: globalDoc },
    { scope: "project", title: t("settings.rulesProject"), hint: t("settings.rulesProjectHint"), file: projectDoc, unavailable: !cwd },
  ];

  return (
    <div className="settings-general settings-rules">
      <p className="settings-general-description">{t("settings.rulesIntro")}</p>
      {loadError ? <p className="settings-rules-error">{loadError}</p> : null}
      {rows.map((row) => {
        const note = shadowNote(row.file, t);
        return (
          <section className="settings-general-section" key={row.scope}>
            <h3 className="settings-general-heading">{row.title}</h3>
            <p className="settings-general-description">{row.hint}</p>
            {row.unavailable ? (
              <p className="settings-general-description">{t("settings.rulesNeedProject")}</p>
            ) : (
              <button
                type="button"
                className="settings-rules-file"
                disabled={!row.file}
                onClick={() => row.file && openFile(row.scope, row.file)}
              >
                <span className="settings-rules-file-name">{RULES_FILENAME}</span>
                <span className="settings-rules-file-path">{row.file?.path ?? ""}</span>
              </button>
            )}
            {note ? <p className="settings-rules-note">{note}</p> : null}
            {!row.unavailable && row.file && !row.file.exists ? (
              <p className="settings-general-description">{t("settings.rulesEmpty")}</p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
