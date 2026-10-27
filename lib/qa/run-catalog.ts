import path from "node:path";
import { listAutomationScripts, readCases } from "./assets";
import { listUiCaptures } from "./ui-capture";

export interface RunnableCase {
  /** Capture or script path, relative to the workspace. */
  file: string;
  kind: "ui" | "api";
  caseId: string;
  title: string;
  recordedAt: string;
}

function caseIdFromFile(file: string): string {
  return /(?:^|_)(TC\d+)/.exec(path.basename(file))?.[1] ?? "";
}

/** UI captures and existing scripts, with the case name a person recorded or wrote. */
export function listRunnableCases(workspace: string): RunnableCase[] {
  const titles = new Map<string, string>();
  const linked = new Map<string, { caseId: string; title: string }>();
  for (const file of readCases(workspace)) {
    for (const item of file.items) {
      if (!titles.has(item.id)) titles.set(item.id, item.title);
      for (const script of item.scripts) {
        if (!linked.has(script)) linked.set(script, { caseId: item.id, title: item.title });
      }
    }
  }

  const captures = listUiCaptures(workspace).map((capture) => ({
    file: capture.file,
    kind: "ui" as const,
    caseId: capture.caseId,
    title: capture.title || titles.get(capture.caseId) || "",
    recordedAt: capture.recordedAt,
  }));
  const scripts = listAutomationScripts(workspace).map((script) => {
    const fromCase = linked.get(script.file);
    const caseId = fromCase?.caseId || caseIdFromFile(script.file);
    return {
      file: script.file,
      kind: script.kind,
      caseId,
      title: fromCase?.title || titles.get(caseId) || "",
      recordedAt: "",
    };
  });
  const uiScripts = scripts.filter((item) => item.kind === "ui").sort((a, b) => a.file.localeCompare(b.file));
  const apiScripts = scripts.filter((item) => item.kind === "api").sort((a, b) => a.file.localeCompare(b.file));
  return [...captures, ...uiScripts, ...apiScripts];
}
