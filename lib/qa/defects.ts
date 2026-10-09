import fs from "node:fs";
import path from "node:path";
import { checkpointModule, loadAgentModule } from "./legacy";
import { readCheckpoint } from "./checkpoint";
import type { Bug, DefectList, DefectSetup } from "./defect-types";

interface DefectsModule {
  fetchDefects(options: { env?: NodeJS.ProcessEnv; source?: string; fetchImpl?: typeof fetch }): Promise<{ configured: boolean; bugs: Bug[]; message: string }>;
  defectSetup(env?: NodeJS.ProcessEnv): DefectSetup;
  saveDefects(workspace: string, result: { bugs: Bug[] }, now?: () => Date): void;
}

function defectsModule(): DefectsModule {
  return loadAgentModule<DefectsModule>("tools/defects.js");
}

export function defectSetup(env: NodeJS.ProcessEnv = process.env): DefectSetup {
  return defectsModule().defectSetup(env);
}

/** defects/latest.json, as the terminal tool and this page both write it. */
export function readDefects(workspace: string): DefectList | null {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(workspace, "defects", "latest.json"), "utf8")) as DefectList;
    return Array.isArray(saved.bugs) ? saved : null;
  } catch {
    return null;
  }
}

function product(workspace: string): string {
  return readCheckpoint(workspace)?.product || path.basename(workspace);
}

export interface SyncOptions {
  source?: "auto" | "zentao" | "jira";
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

/**
 * Read defects from Zentao or Jira with the server's own credentials, save them,
 * and record the step in the checkpoint like the terminal tool does.
 */
export async function syncDefects(workspace: string, options: SyncOptions = {}): Promise<{ configured: boolean; count: number; message: string }> {
  const checkpoint = checkpointModule();
  let result: Awaited<ReturnType<DefectsModule["fetchDefects"]>>;
  try {
    result = await defectsModule().fetchDefects({ env: options.env ?? process.env, source: options.source ?? "auto", fetchImpl: options.fetchImpl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checkpoint.updateCheckpoint(workspace, { product: product(workspace), task: "defects", step: "fetch", action: "fail", note: message });
    throw error;
  }
  if (result.configured) defectsModule().saveDefects(workspace, result);
  checkpoint.updateCheckpoint(workspace, {
    product: product(workspace),
    task: "defects",
    step: "fetch",
    action: result.configured ? "complete" : "fail",
    note: result.message,
  });
  return { configured: result.configured, count: result.bugs.length, message: result.message };
}
