import fs from "node:fs";
import path from "node:path";
import { pointsConfirmedInCheckpoint } from "./checkpoint";
import { parseItems } from "./markdown";

/** Sub-directories of a product workspace, as the opentest-qa skill lays them out. */
export const WORKSPACE_DIRS = [
  "knowledge",
  "graph",
  "test-points",
  "cases",
  "automation",
  "defects",
  "reports",
  "tasks",
] as const;

export type WorkspaceDir = (typeof WORKSPACE_DIRS)[number];

export interface QaItem {
  id: string;
  title: string;
  priority: string;
  /** Test point: 待确认 or 已确认. */
  status: string;
  /** Case: whether an automation script is attached. */
  automated: boolean;
  scripts: string[];
  /** The text under the heading, shown as-is in the detail view. */
  body: string;
  /** File the item lives in, relative to the workspace. */
  file: string;
}

export interface QaFile {
  file: string;
  items: QaItem[];
}

export const STATUS_PENDING = "待确认";
export const STATUS_CONFIRMED = "已确认";

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function listFiles(dir: string, filter: (name: string) => boolean, depth = 4): string[] {
  const found: string[] = [];
  const walk = (current: string, level: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        // The healing history under versions/ is not a script of its own.
        if (level < depth && entry.name !== "versions" && entry.name !== "node_modules") walk(full, level + 1);
      } else if (filter(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(dir, 0);
  return found;
}

export function listMarkdownFiles(workspace: string, dir: WorkspaceDir): string[] {
  return listFiles(path.join(workspace, dir), (name) => name.endsWith(".md"), 2).map((file) =>
    path.relative(workspace, file),
  );
}

function splitScripts(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[，、,;；]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function readQaFiles(workspace: string, dir: "test-points" | "cases", defaultStatus: string): QaFile[] {
  return listMarkdownFiles(workspace, dir).map((relative) => {
    const markdown = fs.readFileSync(path.join(workspace, relative), "utf8");
    const items = parseItems(markdown).map<QaItem>((item) => ({
      id: item.id,
      title: item.title,
      priority: item.fields["优先级"] ?? "",
      status: item.fields["状态"] ?? defaultStatus,
      automated: item.fields["自动化"] === "是",
      scripts: splitScripts(item.fields["脚本"]),
      body: item.body.replace(/^\n+/, "").replace(/\s+$/, ""),
      file: relative,
    }));
    return { file: relative, items };
  });
}

export function readTestPoints(workspace: string): QaFile[] {
  // A pass confirmed in the terminal has no per-point field; it still counts.
  return readQaFiles(workspace, "test-points", pointsConfirmedInCheckpoint(workspace) ? STATUS_CONFIRMED : STATUS_PENDING);
}

export function readCases(workspace: string): QaFile[] {
  return readQaFiles(workspace, "cases", "");
}

export interface AutomationScript {
  /** Relative to the workspace. */
  file: string;
  kind: "ui" | "api";
}

/** Playwright specs and pytest files under automation/, without healing history. */
export function listAutomationScripts(workspace: string): AutomationScript[] {
  const root = path.join(workspace, "automation");
  const scripts: AutomationScript[] = [];
  for (const file of listFiles(root, (name) => /\.spec\.[jt]s$/.test(name) || /^test_.*\.py$/.test(name) || /_test\.py$/.test(name))) {
    scripts.push({ file: path.relative(workspace, file), kind: file.endsWith(".py") ? "api" : "ui" });
  }
  return scripts;
}

export function readGraphSummary(workspace: string): { nodes: number } | null {
  const file = path.join(workspace, "graph", "graph.json");
  if (!isFile(file)) return null;
  try {
    const graph = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const nodes = Object.entries(graph)
      .filter(([key, value]) => key !== "relationships" && Array.isArray(value))
      .reduce((sum, [, value]) => sum + (value as unknown[]).length, 0);
    return { nodes };
  } catch {
    return { nodes: 0 };
  }
}

export interface AssetFile {
  /** Relative to the workspace. */
  file: string;
  name: string;
  absolute: string;
  size: number;
  modifiedAt: string;
  kind?: "ui" | "api";
}

/** Files of one workspace sub-directory, newest first, without healing history. */
export function listAssetFiles(workspace: string, dir: WorkspaceDir): AssetFile[] {
  const root = path.join(workspace, dir);
  const scripts = dir === "automation" ? new Map(listAutomationScripts(workspace).map((script) => [script.file, script.kind])) : null;
  return listFiles(root, () => true, 3)
    .map<AssetFile>((absolute) => {
      const stat = fs.statSync(absolute);
      const file = path.relative(workspace, absolute);
      return {
        file,
        name: path.basename(absolute),
        absolute,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        ...(scripts?.get(file) ? { kind: scripts.get(file) } : {}),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
