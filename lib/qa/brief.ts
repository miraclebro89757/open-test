import fs from "node:fs";
import path from "node:path";
import { readCheckpoint } from "./checkpoint";
import { checkpointModule, loadAgentModule } from "./legacy";

export interface BriefData {
  text: string;
  caseCount: number;
  automated: number;
  defectFiles: number;
  defectCount: number | null;
  run: { id: string; passed: number; failed: number; skipped: number; errors: number } | null;
}

/** What the brief would say right now, built only from files in the workspace. */
export function previewBrief(workspace: string): BriefData {
  return loadAgentModule<{ buildReport(workspace: string): BriefData }>("tools/report.js").buildReport(workspace);
}

/** The terminal tool's file-name rule: a bare name, no directory, `.md` added when missing. */
export function briefFileName(name?: string): string {
  const safe = path.basename(name || "brief.md").replace(/[^\w.\-\u4e00-\u9fff]/g, "");
  return safe.endsWith(".md") ? safe : `${safe || "brief"}.md`;
}

export function writeBrief(workspace: string, name?: string): { file: string; relative: string; brief: BriefData } {
  const brief = previewBrief(workspace);
  const file = path.join(workspace, "reports", briefFileName(name));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, brief.text);
  checkpointModule().updateCheckpoint(workspace, {
    product: readCheckpoint(workspace)?.product || path.basename(workspace),
    task: "report",
    step: path.basename(file),
    action: "complete",
  });
  return { file, relative: path.relative(workspace, file), brief };
}
