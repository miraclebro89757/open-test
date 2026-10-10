import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  inspectUploadTargets,
  parseUploadConflictStrategy,
  type UploadConflictStrategy,
} from "./file-upload";
import { pickFiles, type PickFilesResult } from "./native-file-picker";
import { isLoopbackHost } from "./open-in-file-manager";

const TICKET_TTL_MS = 10 * 60 * 1000;

export interface PickedSource {
  name: string;
  source: string;
}

interface StoredUpload {
  directory: string;
  sources: PickedSource[];
  expires: number;
}

const tickets = new Map<string, StoredUpload>();

export interface NativeCopyDone {
  kind: "done";
  uploaded: string[];
  skipped: string[];
  errors: Array<{ name: string; error: string }>;
}

export interface NativeCopyConflict {
  kind: "conflict";
  conflicts: string[];
  nonReplaceable: string[];
}

export type NativeUploadBody = {
  status: number;
  body: Record<string, unknown>;
};

function pruneTickets(now: number): void {
  for (const [id, ticket] of tickets) {
    if (ticket.expires <= now) tickets.delete(id);
  }
}

export function rememberNativeUpload(
  directory: string,
  sources: PickedSource[],
  now = Date.now(),
): string {
  pruneTickets(now);
  const id = randomBytes(24).toString("hex");
  tickets.set(id, { directory, sources, expires: now + TICKET_TTL_MS });
  return id;
}

export function takeNativeUpload(id: string, directory: string, now = Date.now()): PickedSource[] | null {
  const ticket = tickets.get(id);
  if (!ticket || ticket.directory !== directory) return null;
  tickets.delete(id);
  if (ticket.expires <= now) return null;
  return ticket.sources;
}

export function releaseNativeUpload(id: string, directory: string): void {
  const ticket = tickets.get(id);
  if (!ticket || ticket.directory !== directory) return;
  tickets.delete(id);
}

export function resetNativeUploadsForTests(): void {
  tickets.clear();
}

function sameFile(left: string, right: string): boolean {
  try {
    const a = fs.statSync(left);
    const b = fs.statSync(right);
    return a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  }
}

function fileContentsPath(source: string): string {
  const stat = fs.lstatSync(source);
  return stat.isSymbolicLink() ? fs.realpathSync(source) : source;
}

/** Names and absolute paths for files the open panel returned. */
export function sourcesFromPickedPaths(paths: string[]): { sources: PickedSource[] } | { error: string; detail?: string } {
  const sources: PickedSource[] = [];
  const names: string[] = [];
  for (const raw of paths) {
    if (typeof raw !== "string" || !raw || raw.includes("\0") || !path.isAbsolute(raw)) {
      return { error: "Invalid file path" };
    }
    const source = path.resolve(raw);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(source);
    } catch {
      return { error: "file-not-found", detail: path.basename(source) || source };
    }
    if (!stat.isFile()) {
      return { error: "not-a-file", detail: path.basename(source) || source };
    }
    const name = path.basename(source);
    names.push(name);
    sources.push({ name, source });
  }

  if (names.length === 0) return { error: "No files selected" };
  const seen = new Set<string>();
  for (const name of names) {
    if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
      return { error: `Invalid file name: ${name || "(empty)"}` };
    }
    if (seen.has(name)) return { error: `Duplicate file name in upload: ${name}` };
    seen.add(name);
  }
  return { sources };
}

function replaceFromPath(destination: string, source: string): void {
  const stat = fs.lstatSync(destination);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Cannot replace a directory or symbolic link");
  }
  const stagingDirectory = fs.mkdtempSync(path.join(path.dirname(destination), ".pi-upload-"));
  const stagingFile = path.join(stagingDirectory, "upload");
  try {
    fs.copyFileSync(fileContentsPath(source), stagingFile);
    fs.chmodSync(stagingFile, stat.mode & 0o777);
    const current = fs.lstatSync(destination);
    if (!current.isFile() || current.isSymbolicLink()) {
      throw new Error("Cannot replace a directory or symbolic link");
    }
    fs.renameSync(stagingFile, destination);
  } finally {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

export function copyPickedFiles(
  directory: string,
  sources: PickedSource[],
  strategy: UploadConflictStrategy,
): NativeCopyDone | NativeCopyConflict {
  const fresh: PickedSource[] = [];
  const skipped = sources.filter((source) => {
    const destination = path.join(directory, source.name);
    if (!sameFile(source.source, destination)) {
      fresh.push(source);
      return false;
    }
    return true;
  }).map((source) => source.name);

  const inspection = inspectUploadTargets(directory, fresh.map((source) => source.name));
  if (strategy === "error" && inspection.conflicts.length > 0) {
    return { kind: "conflict", conflicts: inspection.conflicts, nonReplaceable: inspection.nonReplaceable };
  }

  const conflictSet = new Set(inspection.conflicts);
  const nonReplaceableSet = new Set(inspection.nonReplaceable);
  const uploaded: string[] = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const source of fresh) {
    const destination = path.join(directory, source.name);
    if (conflictSet.has(source.name) && strategy === "skip") {
      skipped.push(source.name);
      continue;
    }
    if (conflictSet.has(source.name) && nonReplaceableSet.has(source.name)) {
      errors.push({ name: source.name, error: "Cannot replace a directory or symbolic link" });
      continue;
    }
    try {
      if (conflictSet.has(source.name)) replaceFromPath(destination, source.source);
      else fs.copyFileSync(fileContentsPath(source.source), destination, fs.constants.COPYFILE_EXCL);
      uploaded.push(source.name);
    } catch (error) {
      errors.push({ name: source.name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { kind: "done", uploaded, skipped, errors };
}

function doneBody(result: NativeCopyDone): NativeUploadBody {
  return {
    status: result.errors.length > 0 ? 207 : 200,
    body: { uploaded: result.uploaded, skipped: result.skipped, errors: result.errors },
  };
}

function readBody(body: unknown): { ticket?: string; strategy?: string; prompt?: string; release?: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.ticket !== undefined && typeof record.ticket !== "string") return null;
  if (record.strategy !== undefined && typeof record.strategy !== "string") return null;
  if (record.prompt !== undefined && typeof record.prompt !== "string") return null;
  if (record.release !== undefined && typeof record.release !== "boolean") return null;
  return {
    ticket: typeof record.ticket === "string" ? record.ticket : undefined,
    strategy: typeof record.strategy === "string" ? record.strategy : undefined,
    prompt: typeof record.prompt === "string" ? record.prompt : undefined,
    release: record.release === true,
  };
}

/**
 * Open Finder on this Mac and copy the chosen files into `directory`.
 * A name that already exists is held on a one-time ticket until the user
 * replaces it, skips it, or dismisses the choice.
 */
export async function runNativeUpload({
  host,
  platform = process.platform,
  directory,
  body,
  signal,
  pick = pickFiles,
  now = Date.now(),
}: {
  host: string | null | undefined;
  platform?: NodeJS.Platform | string;
  directory: string;
  body: unknown;
  signal?: AbortSignal;
  pick?: (options: { prompt?: string; defaultPath?: string; signal?: AbortSignal }) => Promise<PickFilesResult>;
  now?: number;
}): Promise<NativeUploadBody> {
  const parsed = readBody(body);
  if (!parsed) return { status: 400, body: { error: "Invalid upload request" } };
  if (!isLoopbackHost(host)) return { status: 403, body: { error: "remote" } };

  if (parsed.release) {
    if (!parsed.ticket) return { status: 400, body: { error: "Invalid upload request" } };
    releaseNativeUpload(parsed.ticket, directory);
    return { status: 200, body: { released: true } };
  }

  if (parsed.ticket) {
    const strategy = parseUploadConflictStrategy(parsed.strategy ?? null);
    if (strategy !== "overwrite" && strategy !== "skip") {
      return { status: 400, body: { error: "Invalid conflict strategy" } };
    }
    const sources = takeNativeUpload(parsed.ticket, directory, now);
    if (!sources) return { status: 409, body: { error: "upload-expired" } };
    const copied = copyPickedFiles(directory, sources, strategy);
    if (copied.kind === "conflict") {
      return {
        status: 409,
        body: {
          error: "One or more files already exist",
          conflicts: copied.conflicts,
          nonReplaceable: copied.nonReplaceable,
        },
      };
    }
    return doneBody(copied);
  }

  if (platform !== "darwin") return { status: 403, body: { error: "unsupported-platform" } };

  const picked = await pick({ prompt: parsed.prompt, defaultPath: "/", signal });
  if (!picked.ok) {
    if (picked.reason === "cancelled") return { status: 200, body: { cancelled: true } };
    if (picked.reason === "unsupported-platform") return { status: 403, body: { error: "unsupported-platform" } };
    return { status: 500, body: { error: picked.message || "Finder could not open" } };
  }

  const described = sourcesFromPickedPaths(picked.paths);
  if ("error" in described) {
    return { status: 400, body: { error: described.error, ...(described.detail ? { detail: described.detail } : {}) } };
  }

  const copied = copyPickedFiles(directory, described.sources, "error");
  if (copied.kind === "conflict") {
    const ticket = rememberNativeUpload(directory, described.sources, now);
    return {
      status: 409,
      body: {
        error: "One or more files already exist",
        ticket,
        conflicts: copied.conflicts,
        nonReplaceable: copied.nonReplaceable,
      },
    };
  }
  return doneBody(copied);
}
