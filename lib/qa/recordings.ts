import fs from "node:fs";
import path from "node:path";
import { readCases } from "./assets";
import { isHttpUrl, type AnalysisView, type Recording, type SandboxInfo } from "./record-request";

export * from "./record-request";

const SANDBOX_FILE = "opentest.sandbox.json";
const STAMPED = String.raw`(.+-\d{9,})`;

function readSandboxConfig(workspace: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(workspace, SANDBOX_FILE), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Same order as the terminal: environment, active environment, default, last used. */
export function readSandbox(workspace: string, environment: NodeJS.ProcessEnv = process.env): SandboxInfo {
  const fromEnvironment = environment.OPENTEST_SANDBOX_URL?.trim();
  if (fromEnvironment) return { url: fromEnvironment, source: "environment" };
  const config = readSandboxConfig(workspace);
  if (config) {
    const environments = (config.environments ?? {}) as Record<string, unknown>;
    const candidates = [
      typeof config.activeEnvironment === "string" ? environments[config.activeEnvironment] : undefined,
      config.defaultUrl,
      config.lastUsedUrl,
    ];
    const found = candidates.find((value): value is string => typeof value === "string" && value.length > 0);
    if (found) return { url: found, source: "config" };
  }
  return { url: "", source: "none" };
}

/** Save the address as the default, keeping whatever else the file holds. */
export function saveSandboxUrl(workspace: string, url: string): void {
  if (!isHttpUrl(url)) throw new Error("The sandbox URL must start with http:// or https://");
  const config = readSandboxConfig(workspace) ?? {
    $comment: "OpenTest 沙箱配置文件 - 配置测试环境的 URL",
    defaultUrl: null,
    environments: {},
    activeEnvironment: null,
    lastUsedUrl: null,
  };
  config.defaultUrl = url;
  config.lastUsedUrl = url;
  fs.writeFileSync(path.join(workspace, SANDBOX_FILE), `${JSON.stringify(config, null, 2)}\n`);
}

/** Cases that still need a Playwright recording and have no script yet. */
export function casesToRecord(workspace: string): Array<{ id: string; title: string }> {
  return readCases(workspace)
    .flatMap((file) => file.items)
    .filter((item) => !item.automated && item.recordingNeed)
    .map((item) => ({ id: item.id, title: item.title }));
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function toAnalysisView(raw: unknown): AnalysisView | null {
  if (!raw || typeof raw !== "object") return null;
  const analysis = raw as Record<string, unknown>;
  const summary = (analysis.summary ?? {}) as Record<string, unknown>;
  const counts = new Map<string, number>();
  for (const field of asArray<{ category?: unknown }>(analysis.sensitiveData)) {
    const category = typeof field?.category === "string" ? field.category : "unknown";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return {
    source: analysis.source === "ai" ? "ai" : analysis.source === "rules" ? "rules" : "unknown",
    requests: Number(summary.totalRequests) || 0,
    endpoints: Number(summary.uniqueEndpoints) || asArray(analysis.endpoints).length,
    variables: asArray<Record<string, unknown>>(analysis.variables).map((variable) => ({
      name: String(variable.name ?? ""),
      type: String(variable.type ?? ""),
      usedIn: asArray(variable.usedIn).length,
    })),
    dependencies: asArray<Record<string, unknown>>(analysis.dependencies).map((dependency) => ({
      from: Number(dependency.from) || 0,
      to: Number(dependency.to) || 0,
      variable: String(dependency.variable ?? ""),
    })),
    sensitive: [...counts].map(([category, count]) => ({ category, count })),
    recommendations: asArray<unknown>(analysis.recommendations).filter((item): item is string => typeof item === "string"),
  };
}

/** Recordings under automation/, grouped by their `<case>-<timestamp>` stem, newest first. */
export function listRecordings(workspace: string): Recording[] {
  const dir = path.join(workspace, "automation");
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const patterns: Array<[RegExp, keyof Pick<Recording, "ui" | "api" | "har" | "env" | "readme"> | "analysis"]> = [
    [new RegExp(`^${STAMPED}\\.spec\\.ts$`), "ui"],
    [new RegExp(`^test_api_${STAMPED}\\.py$`), "api"],
    [new RegExp(`^${STAMPED}\\.har$`), "har"],
    [new RegExp(`^${STAMPED}\\.env\\.example$`), "env"],
    [new RegExp(`^${STAMPED}_README\\.md$`), "readme"],
    [new RegExp(`^${STAMPED}\\.analysis\\.json$`), "analysis"],
  ];
  const byId = new Map<string, Recording>();
  const analysisFiles = new Map<string, string>();
  for (const name of names) {
    for (const [pattern, slot] of patterns) {
      const match = pattern.exec(name);
      if (!match) continue;
      const id = match[1];
      const stamp = Number(/-(\d+)$/.exec(id)?.[1]);
      const recording = byId.get(id) ?? {
        id,
        caseId: id.replace(/-\d+$/, ""),
        recordedAt: Number.isFinite(stamp) ? new Date(stamp).toISOString() : "",
        ui: "", api: "", har: "", env: "", readme: "",
        analysis: null,
      };
      if (slot === "analysis") analysisFiles.set(id, path.join(dir, name));
      else recording[slot] = path.posix.join("automation", name);
      byId.set(id, recording);
    }
  }
  for (const [id, file] of analysisFiles) {
    try {
      byId.get(id)!.analysis = toAnalysisView(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch {
      // A damaged analysis leaves the recording listed without it.
    }
  }
  return [...byId.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

