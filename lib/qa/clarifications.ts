import fs from "node:fs";
import path from "node:path";
import { listMarkdownFiles } from "./assets";
import {
  CLARIFICATION_STATUSES,
  parseClarificationDocument,
  updateClarificationMarkdown,
  type ClarificationItem,
  type ClarificationStatus,
} from "./clarification-format";
import { ReviewError } from "./review";

export {
  CLARIFICATION_STATUSES,
  clarificationFileLocation,
  parseClarificationDocument,
  splitClarificationMarkdown,
  updateClarificationMarkdown,
  type ClarificationDocument,
  type ClarificationItem,
  type ClarificationStatus,
} from "./clarification-format";

const MAX_SUPPLEMENT = 4000;

function knowledgeFile(workspace: string, file: string): string {
  if (typeof file !== "string" || !file.endsWith(".md")) throw new ReviewError("file must be a .md path");
  const absolute = path.resolve(workspace, file);
  const root = path.join(path.resolve(workspace), "knowledge");
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new ReviewError("file must be inside knowledge/", 403);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new ReviewError("file not found", 404);
  return absolute;
}

export function readClarificationDocuments(workspace: string): ClarificationDocument[] {
  const documents: ClarificationDocument[] = [];
  for (const relative of listMarkdownFiles(workspace, "knowledge")) {
    const markdown = fs.readFileSync(path.join(workspace, relative), "utf8");
    const document = parseClarificationDocument(markdown, relative);
    if (document) documents.push(document);
  }
  return documents;
}

export function applyClarificationUpdate(
  workspace: string,
  file: string,
  id: string,
  status: unknown,
  supplement: unknown,
): ClarificationItem {
  if (typeof id !== "string" || !id.trim()) throw new ReviewError("id is required");
  if (typeof status !== "string" || !CLARIFICATION_STATUSES.includes(status as ClarificationStatus)) {
    throw new ReviewError("status must be 待处理, 忽略, 已补充 or 待讨论");
  }
  const note = typeof supplement === "string" ? supplement : "";
  if (note.length > MAX_SUPPLEMENT) throw new ReviewError("补充过长");
  const safeNote = note.replace(/\0/g, "").replace(/^###\s+/gm, "");
  const absolute = knowledgeFile(workspace, file);
  const markdown = fs.readFileSync(absolute, "utf8");
  const next = updateClarificationMarkdown(markdown, id, { status: status as ClarificationStatus, supplement: safeNote });
  if (next === null) throw new ReviewError("clarification not found", 404);
  const temporary = `${absolute}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, next);
  fs.renameSync(temporary, absolute);
  const updated = parseClarificationDocument(next, file)?.items.find((item) => item.id === id);
  if (!updated) throw new ReviewError("clarification not found", 404);
  return updated;
}
