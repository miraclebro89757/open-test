import fs from "node:fs";
import path from "node:path";
import { loadAgentModule } from "./legacy";
import type { Bug, DefectList, DefectSetup, TrackerMcp } from "./defect-types";

interface DefectsModule {
  listTrackers(options?: { env?: NodeJS.ProcessEnv; workspace?: string }): TrackerMcp[];
  recordDefects(workspace: string, bugs: unknown, now?: () => Date): { count: number; message: string };
  saveDefects(workspace: string, result: { bugs: Bug[] }, now?: () => Date): void;
}

function defectsModule(): DefectsModule {
  return loadAgentModule<DefectsModule>("tools/defects.js");
}

/** Connected bug-tracker MCP servers. Names only. */
export function defectSetup(workspace: string, env: NodeJS.ProcessEnv = process.env): DefectSetup {
  return { trackers: defectsModule().listTrackers({ env, workspace }) };
}

/** defects/latest.json, written after an MCP read. */
export function readDefects(workspace: string): DefectList | null {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(workspace, "defects", "latest.json"), "utf8")) as DefectList;
    return Array.isArray(saved.bugs) ? saved : null;
  } catch {
    return null;
  }
}

/** Store defects the agent already read from a bug-tracker MCP. */
export function recordDefects(workspace: string, bugs: unknown, now?: () => Date): { count: number; message: string } {
  return defectsModule().recordDefects(workspace, bugs, now);
}
