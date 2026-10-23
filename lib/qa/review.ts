import fs from "node:fs";
import path from "node:path";
import { STATUS_CONFIRMED, STATUS_PENDING, listMarkdownFiles, readTestPoints } from "./assets";
import { pointsConfirmedInCheckpoint } from "./checkpoint";
import { checkpointModule } from "./legacy";
import { parseFields, parseItems, setItemBody, setItemField, setItemTitle } from "./markdown";

export type ReviewKind = "test-points" | "cases";

export class ReviewError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** A markdown file under test-points/ or cases/, addressed relative to the workspace. */
export function resolveReviewFile(workspace: string, kind: ReviewKind, file: unknown): string {
  if (typeof file !== "string" || !file.endsWith(".md")) throw new ReviewError("file must be a .md path");
  const absolute = path.resolve(workspace, file);
  const root = path.join(path.resolve(workspace), kind);
  if (!absolute.startsWith(root + path.sep)) throw new ReviewError(`file must be inside ${kind}/`, 403);
  if (!fs.existsSync(absolute)) throw new ReviewError("file not found", 404);
  return absolute;
}

function writeAtomic(file: string, text: string): void {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
}

/**
 * Keep the checkpoint in step with the per-point statuses: the terminal's
 * /cases refuses to run until test-points has its `confirmed` step, so the
 * Web confirms that step exactly when every point is confirmed.
 */
export function syncPointsCheckpoint(workspace: string): { allConfirmed: boolean } {
  const points = readTestPoints(workspace).flatMap((file) => file.items);
  const allConfirmed = points.length > 0 && points.every((point) => point.status === STATUS_CONFIRMED);
  const checkpoint = checkpointModule();
  checkpoint.updateCheckpoint(workspace, allConfirmed
    ? { action: "complete", task: "test-points", step: "confirmed" }
    : { action: "drop", task: "test-points", step: "confirmed" });
  return { allConfirmed };
}

/**
 * A pass confirmed in the terminal has no per-point status lines; reading it
 * treats every point as confirmed. Before one point is reopened, write that
 * state into the files so the others keep it.
 */
export function materializeConfirmedStatuses(workspace: string): void {
  if (!pointsConfirmedInCheckpoint(workspace)) return;
  for (const relative of listMarkdownFiles(workspace, "test-points")) {
    const absolute = path.join(workspace, relative);
    let markdown = fs.readFileSync(absolute, "utf8");
    let changed = false;
    for (const item of parseItems(markdown)) {
      if ("状态" in item.fields) continue;
      markdown = setItemField(markdown, item.id, "状态", STATUS_CONFIRMED) ?? markdown;
      changed = true;
    }
    if (changed) writeAtomic(absolute, markdown);
  }
}

export type PointAction =
  | { action: "confirm" | "unconfirm"; ids: string[] }
  | { action: "confirm-all" };

/** Confirm or reopen test points. Returns how many points changed. */
export function applyPointAction(workspace: string, file: string, request: PointAction): { changed: number; allConfirmed: boolean } {
  const absolute = resolveReviewFile(workspace, "test-points", file);
  materializeConfirmedStatuses(workspace);
  let markdown = fs.readFileSync(absolute, "utf8");
  const status = request.action === "unconfirm" ? STATUS_PENDING : STATUS_CONFIRMED;
  const targets = request.action === "confirm-all" ? parseItems(markdown).map((item) => item.id) : request.ids;
  let changed = 0;
  for (const id of targets) {
    const item = parseItems(markdown).find((candidate) => candidate.id === id);
    if (!item) continue;
    // A point with no status line yet counts as pending.
    if ((item.fields["状态"] ?? STATUS_PENDING) === status && "状态" in item.fields) continue;
    const next = setItemField(markdown, id, "状态", status);
    if (next !== null) {
      markdown = next;
      changed += 1;
    }
  }
  if (changed) writeAtomic(absolute, markdown);
  // Confirm-all in one file must also settle the other files' points, so this
  // runs over the whole workspace, not just the file that changed.
  return { changed, allConfirmed: syncPointsCheckpoint(workspace).allConfirmed };
}

export interface ItemEdit {
  id: string;
  title?: string;
  /** Everything under the heading: `- 字段：值` lines and notes. */
  body?: string;
}

/**
 * Edit one test point or case. Changing the content of a confirmed point
 * reopens it, so a point is only ever confirmed as it was last read.
 */
export function editItem(workspace: string, kind: ReviewKind, file: string, edit: ItemEdit): { id: string } {
  const absolute = resolveReviewFile(workspace, kind, file);
  if (kind === "test-points") materializeConfirmedStatuses(workspace);
  let markdown = fs.readFileSync(absolute, "utf8");
  const before = parseItems(markdown).find((item) => item.id === edit.id);
  if (!before) throw new ReviewError(`Item ${edit.id} was not found`, 404);

  let contentChanged = false;
  if (typeof edit.body === "string") {
    const next = setItemBody(markdown, edit.id, edit.body);
    if (next === null) throw new ReviewError(`Item ${edit.id} was not found`, 404);
    contentChanged ||= parseItems(next).find((item) => item.id === edit.id)?.body.trim() !== before.body.trim();
    markdown = next;
  }
  if (typeof edit.title === "string" && edit.title.trim() && edit.title.trim() !== before.title) {
    const next = setItemTitle(markdown, edit.id, edit.title);
    if (next === null) throw new ReviewError("The title cannot be empty", 400);
    contentChanged = true;
    markdown = next;
  }

  if (kind === "test-points" && contentChanged) {
    const after = parseItems(markdown).find((item) => item.id === edit.id);
    const statusLineEdited = after && parseFields(after.body)["状态"] !== before.fields["状态"];
    if (!statusLineEdited) markdown = setItemField(markdown, edit.id, "状态", STATUS_PENDING) ?? markdown;
  }
  writeAtomic(absolute, markdown);
  if (kind === "test-points") syncPointsCheckpoint(workspace);
  return { id: edit.id };
}
