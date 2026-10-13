import fs from "node:fs";
import path from "node:path";
import type { WorkPolicy } from "./client";

export type { WorkPolicy };

export function isWorkPolicy(value: unknown): value is WorkPolicy {
  return value === "guided" || value === "balanced" || value === "autonomous";
}

export interface PolicyFile {
  mode: WorkPolicy;
  setAt: string;
}

/** Missing file means the default: keep generating, and stop only for risk. */
export function readPolicy(workspace: string): PolicyFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(workspace, "tasks", "policy.json"), "utf8")) as { mode?: unknown; setAt?: unknown };
    if (isWorkPolicy(parsed.mode)) return { mode: parsed.mode, setAt: typeof parsed.setAt === "string" ? parsed.setAt : "" };
  } catch {
    // A workspace that has not chosen a policy stays on 智能协作.
  }
  return { mode: "balanced", setAt: "" };
}

export function writePolicy(workspace: string, mode: WorkPolicy): PolicyFile {
  const dir = path.join(workspace, "tasks");
  fs.mkdirSync(dir, { recursive: true });
  const previous = readPolicy(workspace);
  const next: PolicyFile = { mode, setAt: new Date().toISOString() };
  fs.appendFileSync(path.join(dir, "policy-log.jsonl"), `${JSON.stringify({ ...next, previous: previous.mode })}\n`);
  fs.writeFileSync(path.join(dir, "policy.json"), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
