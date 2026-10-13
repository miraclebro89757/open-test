import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  COMPACT_EVERY,
  LESSON_FILE_HEADER,
  LESSON_STATUSES,
  LESSON_TARGETS,
  OVERTURN_LIMIT,
  parseLessons,
  renderLesson,
  renderStoredLesson,
  type Lesson,
  type LessonInput,
  type LessonScope,
  type LessonStatus,
} from "./lesson-format";
import { parseItems, setItemField, setItemTitle } from "./markdown";
import { ReviewError } from "./review";

export * from "./lesson-format";

export const PRODUCT_LESSON_FILE = path.join("knowledge", "审核经验.md");

/** Lessons for every product. OPENTEST_LESSONS_DIR moves it, for tests. */
export function globalLessonFile(environment: NodeJS.ProcessEnv = process.env): string {
  const dir = environment.OPENTEST_LESSONS_DIR?.trim() || path.join(os.homedir(), ".pi", "agent", "opentest");
  return path.join(dir, "审核经验.md");
}

function lessonFile(workspace: string, id: string): string {
  return id.startsWith("G") ? globalLessonFile() : path.join(workspace, PRODUCT_LESSON_FILE);
}

function readFile(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
}

/** This product's lessons first, then the ones for every product. */
export function readLessons(workspace: string): Lesson[] {
  return [
    ...parseLessons(readFile(path.join(workspace, PRODUCT_LESSON_FILE)), "本产品"),
    ...parseLessons(readFile(globalLessonFile()), "全部产品"),
  ];
}

export function findLesson(workspace: string, id: string): Lesson {
  const lesson = readLessons(workspace).find((item) => item.id === id);
  if (!lesson) throw new ReviewError(`没有经验 ${id}`, 404);
  return lesson;
}

function nextId(markdown: string, prefix: "R" | "G"): string {
  const numbers = parseLessons(markdown, "本产品")
    .map((lesson) => new RegExp(`^${prefix}(\\d+)$`).exec(lesson.id))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => Number.parseInt(match[1], 10));
  return `${prefix}${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, "0")}`;
}

export function saveLesson(workspace: string, input: LessonInput, counts: { hits?: number; overturned?: number } = {}): Lesson {
  if (!input.title.trim() || !input.action.trim()) throw new ReviewError("经验要写标题和做法");
  if (!LESSON_TARGETS.includes(input.target)) throw new ReviewError("适用只能是待澄清、测试点或用例");
  if (input.target === "待澄清" && !["已补充", "忽略", "待讨论"].includes(input.decision)) {
    throw new ReviewError("待澄清的经验要写决定：已补充、忽略或待讨论");
  }
  const global = input.scope === "全部产品";
  const file = global ? globalLessonFile() : path.join(workspace, PRODUCT_LESSON_FILE);
  const existing = readFile(file);
  const id = nextId(existing, global ? "G" : "R");
  const base = existing.trim() ? `${existing.replace(/\s+$/, "")}\n\n` : `${LESSON_FILE_HEADER}\n`;
  writeAtomic(file, `${base}${renderLesson(id, input, counts)}`);
  return findLesson(workspace, id);
}

function setFields(workspace: string, id: string, values: Record<string, string>): Lesson {
  const file = lessonFile(workspace, id);
  let markdown = readFile(file);
  for (const [name, value] of Object.entries(values)) {
    const next = setItemField(markdown, id, name, value);
    if (next === null) throw new ReviewError(`没有经验 ${id}`, 404);
    markdown = next;
  }
  writeAtomic(file, markdown);
  return findLesson(workspace, id);
}

export function setLessonStatus(workspace: string, id: string, status: LessonStatus): Lesson {
  if (!LESSON_STATUSES.includes(status)) throw new ReviewError("状态只能是待确认、已启用或停用");
  return setFields(workspace, id, { 状态: status });
}

export function recordLessonHit(workspace: string, id: string): Lesson {
  const lesson = findLesson(workspace, id);
  return setFields(workspace, id, { 命中: String(lesson.hits + 1) });
}

/** A person undid what the lesson did. Past the limit the lesson stops applying. */
export function recordLessonOverturn(workspace: string, id: string): Lesson {
  const lesson = findLesson(workspace, id);
  const overturned = lesson.overturned + 1;
  return setFields(workspace, id, {
    推翻: String(overturned),
    ...(overturned >= OVERTURN_LIMIT && lesson.status === "已启用" ? { 状态: "停用" } : {}),
  });
}

/** `审核经验 R001` → R001. */
export function lessonIdFromBasis(basis: string | undefined): string | null {
  const match = /审核经验\s*([RG]\d+)/.exec(basis ?? "");
  return match ? match[1] : null;
}

function sameKeywords(a: string[], b: string[]): boolean {
  if (!a.length || a.length !== b.length) return false;
  return [...a].sort().join("、") === [...b].sort().join("、");
}

function matchingLesson(workspace: string, input: LessonInput, question: string): Lesson | undefined {
  return readLessons(workspace).find((lesson) => {
    if (lesson.status !== "已启用" || lesson.target !== input.target || lesson.decision !== input.decision) return false;
    if (sameKeywords(lesson.keywords, input.keywords)) return true;
    return lesson.keywords.length > 0 && lesson.keywords.every((word) => question.includes(word) || input.action.includes(word));
  });
}

function removeLesson(workspace: string, id: string): void {
  const file = lessonFile(workspace, id);
  const markdown = readFile(file);
  const item = parseItems(markdown).find((entry) => entry.id === id);
  if (!item) return;
  writeAtomic(file, `${markdown.slice(0, item.start)}${markdown.slice(item.end)}`.replace(/\n{3,}/g, "\n\n"));
}

function promoteToGlobal(workspace: string, id: string): Lesson {
  const lesson = findLesson(workspace, id);
  if (lesson.scope === "全部产品") return lesson;
  const moved = saveLesson(workspace, { ...lesson, scope: "全部产品", status: lesson.status }, { hits: lesson.hits, overturned: lesson.overturned });
  removeLesson(workspace, id);
  return moved;
}

/**
 * Write a lesson from a person's mark. An existing enabled lesson with the same
 * keywords is reused (hits go up) instead of adding another heading.
 */
export function recordFeedback(workspace: string, input: LessonInput, question: string): Lesson {
  const existing = matchingLesson(workspace, input, question);
  if (existing) {
    const hit = recordLessonHit(workspace, existing.id);
    return input.scope === "全部产品" && hit.scope === "本产品" ? promoteToGlobal(workspace, hit.id) : hit;
  }
  return saveLesson(workspace, input, { hits: 1 });
}

export interface LessonPatch {
  title?: string;
  status?: LessonStatus;
  scope?: LessonScope;
  condition?: string;
  action?: string;
  decision?: string;
  keywords?: string[];
}

export function updateLesson(workspace: string, id: string, patch: LessonPatch): Lesson {
  let current = findLesson(workspace, id);
  if (patch.scope && patch.scope !== current.scope) {
    if (patch.scope === "全部产品") current = promoteToGlobal(workspace, current.id);
    else {
      const moved = saveLesson(workspace, { ...current, scope: "本产品", status: current.status }, { hits: current.hits, overturned: current.overturned });
      removeLesson(workspace, current.id);
      current = moved;
    }
  }
  const values: Record<string, string> = {};
  if (patch.status) values["状态"] = patch.status;
  if (patch.condition !== undefined) values["条件"] = patch.condition;
  if (patch.action !== undefined) values["做法"] = patch.action;
  if (patch.decision !== undefined) values["决定"] = patch.decision;
  if (patch.keywords) values["关键词"] = patch.keywords.join("、");
  if (Object.keys(values).length) current = setFields(workspace, current.id, values);
  if (patch.title?.trim() && patch.title.trim() !== current.title) {
    const file = lessonFile(workspace, current.id);
    const next = setItemTitle(readFile(file), current.id, patch.title.trim());
    if (next) writeAtomic(file, next);
    current = findLesson(workspace, current.id);
  }
  return current;
}

function mergeKey(lesson: Lesson): string {
  if (!lesson.keywords.length) return `id:${lesson.id}`;
  return `${lesson.target}|${lesson.decision}|${[...lesson.keywords].sort().join("、")}`;
}

function archiveFile(file: string): string {
  return file.replace(/审核经验\.md$/, "审核经验.归档.md");
}

function appendArchive(file: string, lessons: Lesson[], label: string): void {
  if (!lessons.length) return;
  const target = archiveFile(file);
  const block = `\n## ${label}\n\n${lessons.map(renderStoredLesson).join("\n")}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, (fs.existsSync(target) ? "" : `${LESSON_FILE_HEADER}\n`) + block);
}

function rewriteLessons(file: string, lessons: Lesson[]): void {
  if (!lessons.length) {
    if (fs.existsSync(file)) writeAtomic(file, `${LESSON_FILE_HEADER}\n`);
    return;
  }
  writeAtomic(file, `${LESSON_FILE_HEADER}\n${lessons.map(renderStoredLesson).join("\n")}`);
}

function compactOneFile(file: string, scope: LessonScope): { kept: Lesson[]; archived: Lesson[] } {
  const lessons = parseLessons(readFile(file), scope);
  if (!lessons.length) return { kept: [], archived: [] };
  const groups = new Map<string, Lesson[]>();
  const archived: Lesson[] = [];
  for (const lesson of lessons) {
    if (lesson.status === "停用") {
      archived.push(lesson);
      continue;
    }
    const key = mergeKey(lesson);
    groups.set(key, [...(groups.get(key) ?? []), lesson]);
  }
  const kept: Lesson[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((left, right) => right.hits - left.hits || left.id.localeCompare(right.id));
    const winner = { ...sorted[0] };
    for (const extra of sorted.slice(1)) {
      winner.hits += extra.hits;
      winner.overturned += extra.overturned;
      winner.origin = `${winner.origin}；${extra.origin}`;
      archived.push(extra);
    }
    if (winner.overturned >= OVERTURN_LIMIT) {
      winner.status = "停用";
      archived.push(winner);
    } else kept.push(winner);
  }
  return { kept, archived };
}

/** Merge duplicate keywords, move 停用 ones into the archive, and drop product copies of a global lesson. */
export function compactLessons(workspace: string): { kept: number; archived: number } {
  const productFile = path.join(workspace, PRODUCT_LESSON_FILE);
  const sharedFile = globalLessonFile();
  const product = compactOneFile(productFile, "本产品");
  const shared = compactOneFile(sharedFile, "全部产品");
  const stillProduct: Lesson[] = [];
  for (const lesson of product.kept) {
    const covered = shared.kept.find((item) => item.target === lesson.target && item.decision === lesson.decision && sameKeywords(item.keywords, lesson.keywords));
    if (covered) {
      covered.hits += lesson.hits;
      covered.overturned += lesson.overturned;
      covered.origin = `${covered.origin}；${lesson.origin}`;
      product.archived.push(lesson);
    } else stillProduct.push(lesson);
  }
  const label = `归档 ${new Date().toISOString().slice(0, 10)}`;
  appendArchive(productFile, product.archived, label);
  appendArchive(sharedFile, shared.archived, label);
  rewriteLessons(productFile, stillProduct);
  rewriteLessons(sharedFile, shared.kept);
  return { kept: stillProduct.length + shared.kept.length, archived: product.archived.length + shared.archived.length };
}

function logLineCount(workspace: string): number {
  try {
    const text = fs.readFileSync(path.join(workspace, "tasks", "review-log.jsonl"), "utf8").trim();
    return text ? text.split("\n").length : 0;
  } catch {
    return 0;
  }
}

function compactStateFile(workspace: string): string {
  return path.join(workspace, "tasks", "lesson-compact.json");
}

/** After every COMPACT_EVERY review-log lines, merge the lesson files so they stay short. */
export function compactIfDue(workspace: string, every = COMPACT_EVERY): { compacted: boolean; kept: number; archived: number } {
  const bucket = Math.floor(logLineCount(workspace) / every);
  let last = 0;
  try {
    last = Number((JSON.parse(fs.readFileSync(compactStateFile(workspace), "utf8")) as { bucket?: number }).bucket) || 0;
  } catch {
    last = 0;
  }
  if (bucket <= last) return { compacted: false, kept: 0, archived: 0 };
  const result = compactLessons(workspace);
  fs.mkdirSync(path.dirname(compactStateFile(workspace)), { recursive: true });
  fs.writeFileSync(compactStateFile(workspace), `${JSON.stringify({ bucket, at: new Date().toISOString(), ...result }, null, 2)}\n`);
  return { compacted: true, ...result };
}
