/**
 * Reading and editing the markdown the QA workflow writes.
 *
 * Test points and cases share one shape, the same one the Terminal Agent's
 * `parseCases` (cli/agent/tools/record.js) reads:
 *
 *     ### TC001 用户登录
 *     - 优先级：高
 *     - 自动化：否
 *     - 步骤：打开登录页，输入账号密码
 *
 * A heading starts an item and `- 名称：值` lines are its fields. The UI only
 * ever rewrites a single field line, so whatever else the agent wrote around it
 * stays byte for byte.
 */

export interface MarkdownItem {
  id: string;
  title: string;
  /** Text after the heading, up to the next item. */
  body: string;
  fields: Record<string, string>;
  /** Offsets into the source markdown. */
  start: number;
  headingEnd: number;
  end: number;
}

const HEADING = /^###\s+(\S+)\s+(.+)$/gm;
const FIELD_LINE = /^[-*]\s*([^：:\n]{1,12})[：:]\s*(.*)$/;

export function parseFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const match = FIELD_LINE.exec(line.trim());
    if (match && !(match[1].trim() in fields)) fields[match[1].trim()] = match[2].trim();
  }
  return fields;
}

export function parseItems(markdown: string): MarkdownItem[] {
  const text = markdown ?? "";
  const matches = [...text.matchAll(HEADING)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const headingEnd = start + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const body = text.slice(headingEnd, end);
    return { id: match[1], title: match[2].trim(), body, fields: parseFields(body), start, headingEnd, end };
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Set `- name：value` inside one item body, adding the line when it is missing. */
export function upsertField(body: string, name: string, value: string): string {
  const pattern = new RegExp(`^- ${escapeRegExp(name)}：.*$`, "m");
  if (pattern.test(body)) return body.replace(pattern, () => `- ${name}：${value}`);
  const leadingBreak = body.startsWith("\n");
  const rest = leadingBreak ? body.slice(1) : body;
  return `${leadingBreak ? "\n" : ""}- ${name}：${value}\n${rest}`;
}

/** Rewrite one field of one item. Returns null when the item does not exist. */
export function setItemField(markdown: string, id: string, name: string, value: string): string | null {
  const item = parseItems(markdown).find((candidate) => candidate.id === id);
  if (!item) return null;
  return markdown.slice(0, item.headingEnd) + upsertField(item.body, name, value) + markdown.slice(item.end);
}

/** Replace the whole body of one item (the part under the heading). */
export function setItemBody(markdown: string, id: string, body: string): string | null {
  const item = parseItems(markdown).find((candidate) => candidate.id === id);
  if (!item) return null;
  const trimmed = body.replace(/^\n+/, "").replace(/\s+$/, "");
  const normalized = `\n${trimmed}${item.end < markdown.length ? "\n\n" : "\n"}`;
  return markdown.slice(0, item.headingEnd) + normalized + markdown.slice(item.end);
}

/** Rename an item: only the heading text changes, the id stays. */
export function setItemTitle(markdown: string, id: string, title: string): string | null {
  const item = parseItems(markdown).find((candidate) => candidate.id === id);
  const clean = title.replace(/\s+/g, " ").trim();
  if (!item || !clean) return null;
  const heading = markdown.slice(item.start, item.headingEnd);
  const prefix = heading.slice(0, heading.indexOf(id) + id.length);
  return markdown.slice(0, item.start) + `${prefix} ${clean}` + markdown.slice(item.headingEnd);
}
