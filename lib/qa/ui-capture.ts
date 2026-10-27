import { createRequire } from "node:module";
import { join } from "node:path";
import { opentestRoot } from "./web-session";

export interface UiCaptureSummary {
  id: string;
  caseId: string;
  title: string;
  recordedAt: string;
  actions: number;
  file: string;
}

export interface CaptureJob {
  status: "recording" | "done" | "error";
  message: string;
}

interface SessionModule {
  listUiCaptures(workspace: string): UiCaptureSummary[];
  runRecordingSession(options: {
    workspace: string;
    sandboxUrl: string;
    caseId: string;
    confirm: () => Promise<boolean>;
    mode: "ui-only";
    openSession: (options: Record<string, unknown>) => Promise<unknown>;
  }): Promise<{ recorded: boolean; message: string }>;
  createPlaywrightRecordingSession(options: Record<string, unknown>): Promise<unknown>;
}

interface BrowserModule {
  ensureRecordingBrowser(): Promise<{ executablePath: string | null }>;
}

const jobs = new Map<string, CaptureJob>();

function loadCli<T>(relativePath: string): T {
  const root = opentestRoot();
  const requireCli = createRequire(join(root, "package.json"));
  const absolute = join(root, relativePath);
  if (process.env.NODE_ENV !== "production") {
    try {
      delete requireCli.cache[requireCli.resolve(absolute)];
    } catch {
      // The file may not have been loaded yet.
    }
  }
  return requireCli(absolute) as T;
}

export class CaptureBusyError extends Error {
  readonly status = 409;
}

export function listUiCaptures(workspace: string): UiCaptureSummary[] {
  return loadCli<SessionModule>("cli/agent/tools/record-session.js").listUiCaptures(workspace);
}

export function captureJob(workspace: string): CaptureJob | null {
  return jobs.get(workspace) ?? null;
}

/** Open Chrome and capture UI actions. The click is the authorization, so this does not ask again. */
export async function startUiCapture(workspace: string, sandboxUrl: string, caseId = ""): Promise<CaptureJob> {
  const current = jobs.get(workspace);
  if (current?.status === "recording") throw new CaptureBusyError("A UI capture is already running.");
  const job: CaptureJob = { status: "recording", message: "" };
  jobs.set(workspace, job);
  let browser: { executablePath: string | null };
  let session: SessionModule;
  try {
    browser = await loadCli<BrowserModule>("cli/browser/recording-browser.js").ensureRecordingBrowser();
    session = loadCli<SessionModule>("cli/agent/tools/record-session.js");
  } catch (error) {
    jobs.set(workspace, { status: "error", message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  void session.runRecordingSession({
    workspace,
    sandboxUrl,
    caseId,
    confirm: async () => true,
    mode: "ui-only",
    openSession: (options) => session.createPlaywrightRecordingSession({
      ...options,
      executablePath: browser.executablePath || undefined,
    }),
  }).then((result) => {
    jobs.set(workspace, {
      status: result.recorded ? "done" : "error",
      message: result.message,
    });
  }).catch((error: unknown) => {
    jobs.set(workspace, {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  });
  return job;
}
