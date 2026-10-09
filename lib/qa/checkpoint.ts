import fs from "node:fs";
import path from "node:path";

export interface CheckpointTask {
  status?: string;
  steps?: Array<{ id: string; status?: string; note?: string }>;
}

export interface CheckpointFile {
  product?: string;
  tasks?: Record<string, CheckpointTask>;
}

/** tasks/checkpoint.json as the agent's task_checkpoint tool writes it. */
export function readCheckpoint(workspace: string): CheckpointFile | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(workspace, "tasks", "checkpoint.json"), "utf8")) as CheckpointFile;
  } catch {
    return null;
  }
}

/** The terminal's /points confirmation, recorded as the `confirmed` step of test-points. */
export function pointsConfirmedInCheckpoint(workspace: string): boolean {
  const steps = readCheckpoint(workspace)?.tasks?.["test-points"]?.steps ?? [];
  return steps.some((step) => step.id === "confirmed" && step.status === "done");
}
