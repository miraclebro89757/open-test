"use client";

import { useCallback, useEffect, useState } from "react";
import type { AssetFile, WorkspaceDir } from "@/lib/qa/assets";
import { Badge, EmptyState, formatSize, formatTime } from "../qa-ui";

interface Props {
  cwd: string;
  dir: WorkspaceDir;
  emptyTitle: string;
  emptyHint: string;
  refreshKey: number;
  onOpenFile: (absolutePath: string) => void;
  /** Extra controls above the list (an "ask the agent" button). */
  actions?: React.ReactNode;
}

/** The files of one workspace folder, newest first. A click opens the file in the file viewer. */
export function AssetFilesPanel({ cwd, dir, emptyTitle, emptyHint, refreshKey, onOpenFile, actions }: Props) {
  const [files, setFiles] = useState<AssetFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/qa/assets?cwd=${encodeURIComponent(cwd)}&dir=${dir}`, { cache: "no-store" });
      const body = (await response.json()) as { files?: AssetFile[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setFiles(body.files ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [cwd, dir]);

  useEffect(() => {
    setFiles(null);
    void load();
  }, [load, refreshKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {actions ? <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>{actions}</div> : null}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {error ? (
          <EmptyState title="读取失败" hint={error} />
        ) : files === null ? (
          <EmptyState title="读取中…" />
        ) : files.length === 0 ? (
          <EmptyState title={emptyTitle} hint={emptyHint} />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {files.map((file) => (
              <li key={file.file}>
                <button
                  type="button"
                  onClick={() => onOpenFile(file.absolute)}
                  title={file.absolute}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px",
                    background: "none", border: "none", borderBottom: "1px solid var(--border)",
                    color: "var(--text)", cursor: "pointer", textAlign: "left", fontSize: 12.5,
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = "none"; }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                    <span style={{ display: "block", color: "var(--text-dim)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.file}</span>
                  </span>
                  {file.kind ? <Badge tone={file.kind === "ui" ? "accent" : "ok"}>{file.kind === "ui" ? "UI" : "API"}</Badge> : null}
                  <span style={{ color: "var(--text-dim)", fontSize: 11, textAlign: "right", flexShrink: 0 }}>
                    {formatSize(file.size)}<br />{formatTime(file.modifiedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
