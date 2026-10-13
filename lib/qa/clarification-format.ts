import { parseItems } from "./markdown";

/** Tester-facing states. 待处理 means nobody has marked the item yet. */
export const CLARIFICATION_STATUSES = ["待处理", "忽略", "已补充", "待讨论"] as const;
export type ClarificationStatus = (typeof CLARIFICATION_STATUSES)[number];

const SECTION_HEADING = /^##\s+(?![^\n]*不列[为成]待澄清)[^\n]*待澄清(?:问题|项)?\s*$/m;
const FIELD_LINE = /^[-*]\s*([^：:\n]{1,12})[：:]\s*(.*)$/;
const NUMBERED_LINE = /^(\d{1,4})\.\s+(\S.*)$/;

export interface ClarificationItem {
  id: string;
  title: string;
  status: ClarificationStatus;
  /** The wording in the requirement. */
  source: string;
  /** What the agent thought it meant. */
  understanding: string;
  /** The tester's answer. Used only when status is 已补充. */
  supplement: string;
  /** Set when the agent marked the item by a review lesson, e.g. 审核经验 R001. */
  basis?: string;
  /** 已认可 once a person has checked an item the agent marked. */
  review?: string;
  file: string;
  /** Section heading, such as "A. 附件依赖". */
  group?: string;
}

export interface ClarificationDocument {
  file: string;
  /** The section exists but has no questions the page can mark. */
  legacy: boolean;
  items: ClarificationItem[];
}

interface SectionSpan {
  headingStart: number;
  start: number;
  end: number;
  text: string;
  heading: string;
}

function clarificationSection(markdown: string): SectionSpan | null {
  const match = SECTION_HEADING.exec(markdown);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = rest.search(/\n##\s+/);
  const end = next === -1 ? markdown.length : start + next;
  return {
    headingStart: match.index,
    start,
    end,
    text: markdown.slice(start, end),
    heading: match[0].replace(/^##\s+/, "").trim(),
  };
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function asStatus(value: string): ClarificationStatus {
  const raw = String(value || "").trim();
  for (const status of CLARIFICATION_STATUSES) {
    if (raw === status || raw.startsWith(`${status}（`) || raw.startsWith(`${status}(`)) return status;
  }
  return "待处理";
}

interface ItemFields {
  source: string;
  understanding: string;
  status: string;
  supplement: string;
  basis: string;
  review: string;
}

/** These two may follow 补充 without becoming part of it. */
const META_FIELDS = new Set(["依据", "复核"]);

function readFields(body: string): ItemFields {
  const source: string[] = [];
  const understanding: string[] = [];
  let status = "";
  let basis = "";
  let review = "";
  let supplement: string | null = null;
  const supplementLines: string[] = [];
  for (const line of body.split("\n")) {
    const match = FIELD_LINE.exec(line.trim());
    const name = match?.[1].trim() ?? "";
    if (match && META_FIELDS.has(name)) {
      if (name === "依据" && !basis) basis = match[2].trim();
      if (name === "复核" && !review) review = match[2].trim();
      continue;
    }
    if (supplement !== null) {
      supplementLines.push(line);
      continue;
    }
    if (!match) continue;
    const value = match[2].trim();
    if (name === "补充") {
      supplement = value;
      continue;
    }
    if (name === "状态" && !status) status = value;
    else if (name === "原文" && source.length === 0) source.push(value);
    else if ((name === "Agent理解" || name === "影响") && understanding.length === 0) understanding.push(value);
  }
  const extra = supplementLines.join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
  const text = [supplement ?? "", extra].filter((part) => part.length > 0).join("\n");
  return { status, source: source.join(""), understanding: understanding.join(""), supplement: text, basis, review };
}

function numberedItems(sectionText: string, file: string): ClarificationItem[] {
  const items: ClarificationItem[] = [];
  const seen = new Set<string>();
  for (const line of sectionText.split("\n")) {
    const match = NUMBERED_LINE.exec(line.trim());
    if (!match) continue;
    const id = `Q${match[1].padStart(3, "0")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const title = match[2].trim();
    items.push({ id, title, status: "待处理", source: title, understanding: "", supplement: "", file });
  }
  return items;
}

function structuredItems(sectionText: string, file: string): ClarificationItem[] {
  return parseItems(sectionText).map((item) => {
    const fields = readFields(item.body);
    return {
      id: item.id,
      title: item.title,
      status: asStatus(fields.status),
      source: fields.source,
      understanding: fields.understanding,
      supplement: fields.supplement,
      ...(fields.basis ? { basis: fields.basis } : {}),
      ...(fields.review ? { review: fields.review } : {}),
      file,
    };
  });
}

interface SectionBlock {
  heading: string;
  headingStart: number;
  contentStart: number;
  end: number;
  text: string;
}

function sectionBlocks(markdown: string): SectionBlock[] {
  const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  if (matches.length === 0) {
    return [{ heading: "", headingStart: 0, contentStart: 0, end: markdown.length, text: markdown }];
  }
  return matches.map((match, index) => {
    const headingStart = match.index ?? 0;
    const contentStart = headingStart + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    return { heading: match[1].trim(), headingStart, contentStart, end, text: markdown.slice(contentStart, end) };
  });
}

function groupCode(heading: string, index: number): string {
  const letter = /^([A-Za-z])\.\s/.exec(heading);
  return letter ? letter[1].toUpperCase() : `S${index + 1}`;
}

function fileIsClarificationList(markdown: string, file: string): boolean {
  const name = file.split(/[/\\]/).pop() ?? "";
  return name.includes("待澄清") || /^#\s+[^\n]*待澄清/m.test(markdown);
}

/** Numbered questions and already-marked ### items, in file order. */
function itemsInBlock(block: SectionBlock, file: string, index: number): ClarificationItem[] {
  const code = groupCode(block.heading, index);
  const group = block.heading || undefined;
  const structured = new Map(structuredItems(block.text, file).map((item) => [item.id, { ...item, group }]));
  const items: ClarificationItem[] = [];
  const seen = new Set<string>();
  for (const line of block.text.split("\n")) {
    const heading = /^###\s+(\S+)\s+/.exec(line.trim());
    if (heading && structured.has(heading[1]) && !seen.has(heading[1])) {
      seen.add(heading[1]);
      items.push(structured.get(heading[1])!);
      continue;
    }
    const numbered = NUMBERED_LINE.exec(line.trim());
    if (!numbered) continue;
    const id = `${code}${numbered[1].padStart(2, "0")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const title = numbered[2].trim();
    items.push({ id, title, status: "待处理", source: title, understanding: "", supplement: "", file, group });
  }
  return items;
}

function blockHasNumberedId(block: SectionBlock, index: number, id: string): boolean {
  const code = groupCode(block.heading, index);
  return block.text.split("\n").some((line) => {
    const numbered = NUMBERED_LINE.exec(line.trim());
    return Boolean(numbered && `${code}${numbered[1].padStart(2, "0")}` === id);
  });
}

/** Items under a 待澄清 heading, or every numbered question in a 待澄清 file. */
export function parseClarificationDocument(markdown: string, file: string): ClarificationDocument | null {
  const section = clarificationSection(markdown);
  if (section) {
    const structured = structuredItems(section.text, file);
    const parsed = structured.length > 0 ? structured : numberedItems(section.text, file);
    const group = /^(?:\d+\.\s*)?待澄清(?:问题|项)?$/.test(section.heading) ? "" : section.heading;
    const items = parsed.map((item) => (group ? { ...item, group } : item));
    return { file, legacy: items.length === 0 && section.text.trim().length > 0, items };
  }
  if (!fileIsClarificationList(markdown, file)) return null;
  const items = sectionBlocks(markdown).flatMap((block, index) => itemsInBlock(block, file, index));
  return { file, legacy: items.length === 0 && markdown.trim().length > 0, items };
}

/** The part of a review file before and after the clarification section. */
export function splitClarificationMarkdown(
  markdown: string,
  file: string,
): { document: ClarificationDocument; before: string; after: string } | null {
  const document = parseClarificationDocument(markdown, file);
  if (!document) return null;
  const section = clarificationSection(markdown);
  if (section) {
    return { document, before: markdown.slice(0, section.headingStart), after: markdown.slice(section.end) };
  }
  const first = sectionBlocks(markdown).find((block) => block.heading);
  return { document, before: first ? markdown.slice(0, first.headingStart) : "", after: "" };
}

function canonicalPath(filePath: string): string {
  return filePath.replace(/^\/System\/Volumes\/Data/, "").replace(/^\/private/, "");
}

/**
 * The open session may use `/System/Volumes/Data/Users/...` while the file tab
 * uses `/Users/...` for the same folder. The API only accepts the session's spelling.
 */
function alignWorkspace(workspace: string, sessionCwd: string | undefined): string {
  if (!sessionCwd) return workspace;
  const cwd = sessionCwd.replace(/\\/g, "/").replace(/\/$/, "");
  const same = canonicalPath(workspace);
  const session = canonicalPath(cwd);
  if (same === session || same.startsWith(`${session}/`)) return cwd + same.slice(session.length);
  return workspace;
}

/** `.../knowledge/name.md` → the product directory plus the path the API expects. */
export function clarificationFileLocation(filePath: string, sessionCwd?: string): { workspace: string; file: string } | null {
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/knowledge/";
  const index = normalized.lastIndexOf(marker);
  if (index <= 0 || !normalized.endsWith(".md")) return null;
  return {
    workspace: alignWorkspace(normalized.slice(0, index), sessionCwd),
    file: `knowledge/${normalized.slice(index + marker.length)}`,
  };
}

function itemBody(item: Pick<ClarificationItem, "status" | "source" | "understanding" | "supplement" | "basis" | "review">): string {
  const supplement = item.supplement.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  const lines = [
    `- 状态：${item.status}`,
    `- 原文：${oneLine(item.source)}`,
    `- Agent理解：${oneLine(item.understanding)}`,
  ];
  if (item.basis) lines.push(`- 依据：${oneLine(item.basis)}`);
  if (item.review) lines.push(`- 复核：${oneLine(item.review)}`);
  if (!supplement) lines.push("- 补充：");
  else {
    const [first, ...rest] = supplement.split("\n");
    lines.push(`- 补充：${first}`);
    lines.push(...rest);
  }
  return `\n${lines.join("\n")}\n\n`;
}

function renderItem(item: ClarificationItem): string {
  return `### ${item.id} ${oneLine(item.title)}${itemBody(item)}`;
}

export interface ClarificationPatch {
  status: ClarificationStatus;
  supplement: string;
  /** A string sets it, null removes it. Left out, it stays only while status and supplement stay. */
  basis?: string | null;
  review?: string | null;
}

function patchedBody(fields: ItemFields, patch: ClarificationPatch): string {
  const unchanged = fields.status === patch.status && fields.supplement === patch.supplement.replace(/\n+$/, "");
  const pick = (value: string | null | undefined, current: string) => (value === undefined ? (unchanged ? current : "") : value ?? "");
  return itemBody({
    status: patch.status,
    source: fields.source,
    understanding: fields.understanding,
    supplement: patch.supplement,
    basis: pick(patch.basis, fields.basis),
    review: pick(patch.review, fields.review),
  });
}

/**
 * Rewrite one item's status and supplement. 原文 and Agent理解 stay.
 * A numbered list is rewritten into ### items on the first mark, and the other questions stay.
 * Returns null when the section or the id is missing.
 */
export function updateClarificationMarkdown(
  markdown: string,
  id: string,
  patch: ClarificationPatch,
): string | null {
  const section = clarificationSection(markdown);
  if (!section) {
    const blocks = sectionBlocks(markdown);
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      const questions = itemsInBlock(block, "", index);
      if (!questions.some((item) => item.id === id)) continue;
      if (!blockHasNumberedId(block, index, id)) break;
      const rewritten = questions.map((item) => renderItem(item.id === id
        ? { ...item, status: patch.status, supplement: patch.supplement, basis: patch.basis ?? undefined, review: patch.review ?? undefined }
        : item)).join("");
      return markdown.slice(0, block.contentStart) + `\n${rewritten}` + markdown.slice(block.end);
    }
    return updateMarkedItem(markdown, id, patch);
  }
  const structured = parseItems(section.text);
  const current = structured.find((candidate) => candidate.id === id);
  if (current) {
    const next = patchedBody(readFields(current.body), patch);
    return markdown.slice(0, section.start + current.headingEnd) + next + markdown.slice(section.start + current.end);
  }
  const numbered = numberedItems(section.text, "");
  if (!numbered.some((item) => item.id === id)) return null;
  const blocks = numbered.map((item) => renderItem(item.id === id
    ? { ...item, status: patch.status, supplement: patch.supplement, basis: patch.basis ?? undefined, review: patch.review ?? undefined }
    : item)).join("");
  return markdown.slice(0, section.start) + `\n${blocks}` + markdown.slice(section.end);
}

function updateMarkedItem(markdown: string, id: string, patch: ClarificationPatch): string | null {
  const current = parseItems(markdown).find((candidate) => candidate.id === id);
  if (!current) return null;
  const next = patchedBody(readFields(current.body), patch);
  const boundary = markdown.slice(current.headingEnd, current.end).search(/\n##\s+/);
  const end = boundary === -1 ? current.end : current.headingEnd + boundary;
  return markdown.slice(0, current.headingEnd) + next + markdown.slice(end);
}
