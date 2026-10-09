import { createRequire } from "node:module";
import { join } from "node:path";
import { opentestRoot } from "./web-session";

/**
 * The checkpoint, report and defect logic lives in CommonJS under cli/agent so
 * the Terminal Agent and the Web UI write the same files in the same way. This
 * loads that code at run time, so the bundler leaves it alone.
 */
export function loadAgentModule<T>(relativePath: string): T {
  const root = opentestRoot();
  return createRequire(join(root, "package.json"))(join(root, "cli", "agent", relativePath)) as T;
}

export interface CheckpointModule {
  updateCheckpoint(
    workspace: string,
    options: { product?: string; sourceFile?: string; action?: string; task?: string; step?: string; steps?: string | string[]; note?: string },
  ): { text: string; state: unknown };
}

export function checkpointModule(): CheckpointModule {
  return loadAgentModule<CheckpointModule>("tasks/checkpoint.js");
}
