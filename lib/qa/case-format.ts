/**
 * Canonical functional-case markdown. New cases follow the V1.1.3 项目巡检
 * shape: numbered steps on their own lines, not "步骤：1 x；2 y".
 */

import { parseItems } from "./markdown";

const FIELD_LINE = /^[-*]\s*([^：:\n]{1,12})[：:]\s*(.*)$/;

const BODY_ORDER = [
  "优先级",
  "自动化",
  "状态",
  "对应测试点",
  "需求版本",
  "轨道",
  "前置条件",
  "步骤",
  "期望结果",
] as const;

/** One paragraph the agent sees in stage / batch / clarification prompts. */
export const CASE_TEMPLATE_RULE = [
  "写功能用例时，正文对齐产品里已有的巡检模版（cases 下「项目巡检」那批），不要另发明缩写格式。",
  "文件头写「# 功能用例-<模块>」、来源、图谱场景。每条字段顺序：优先级、自动化、对应测试点、前置条件、步骤、期望结果。自动化写成否。草稿在自动化下一行加「- 状态：待确认」。",
  "步骤必须换行编号，即使只有一步，写成「- 步骤：」下一行「  1. …」。禁止「- 步骤：1 x；2 y」或把多步挤在同一行。",
  "不必为了对齐模版去改已经写好的旧用例，也不必补「- 需求版本：」行，表格会按工作区推断。",
].join("");

export function parseNamedFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let current: string | null = null;
  for (const line of String(body || "").replace(/^\n/, "").split("\n")) {
    const match = FIELD_LINE.exec(line);
    if (match && !/^\s/.test(line)) {
      current = match[1].trim();
      if (!(current in fields)) fields[current] = match[2];
      continue;
    }
    if (!current) continue;
    const extra = line.replace(/^\s{0,4}/, "");
    fields[current] = fields[current] ? `${fields[current]}\n${extra}` : extra;
  }
  for (const key of Object.keys(fields)) {
    fields[key] = String(fields[key] || "")
      .replace(/\r\n/g, "\n")
      .replace(/^\n+/, "")
      .replace(/\s+$/, "");
  }
  return fields;
}

/** Turn "1 x；2 y" or a single sentence into "1. x\\n2. y". */
export function expandInlineSteps(value: string): string {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/^\n+/, "")
    .replace(/\s+$/, "");
  if (!text) return "";
  const chunks: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.replace(/^\s+/, "").trim();
    if (!trimmed) continue;
    const parts = /[；;]/.test(trimmed) ? trimmed.split(/[；;]/) : [trimmed];
    for (const part of parts) {
      const step = part.trim().replace(/^\d+[\.、)）.\s]+/, "").trim();
      if (step) chunks.push(step);
    }
  }
  return chunks.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

export function formatStepField(value: string): string {
  const steps = expandInlineSteps(value);
  if (!steps) return "- 步骤：";
  return `- 步骤：\n${steps
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}`;
}

export function normalizeCaseItemBody(body: string): string {
  const fields = parseNamedFields(body);
  if (!String(fields["自动化"] || "").trim()) fields["自动化"] = "否";
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const name of BODY_ORDER) {
    seen.add(name);
    if (name === "步骤") {
      lines.push(formatStepField(fields["步骤"] || ""));
      continue;
    }
    const value = String(fields[name] || "").trim();
    if (!value) continue;
    lines.push(`- ${name}：${value}`);
  }
  for (const [name, value] of Object.entries(fields)) {
    if (seen.has(name) || !String(value || "").trim()) continue;
    lines.push(`- ${name}：${value}`);
  }
  return lines.join("\n");
}

/** Keep the title; split jammed 来源 notes; add 图谱场景 when missing. */
export function normalizeCaseFileHeader(header: string, scenes = ""): string {
  const lines = String(header || "")
    .replace(/\s+$/, "")
    .split("\n");
  const title = lines.find((line) => line.startsWith("# ")) || "";
  const sourceLine = lines.find((line) => line.startsWith("来源：")) || "";
  const existingScene = lines.find((line) => line.startsWith("图谱场景：")) || "";
  const extras: string[] = [];
  const matched = sourceLine.match(/^(来源：(?:test-points\/)?[^\s（]+（[^）]+）)\s*[；;]?\s*(.*)$/);
  const source = matched ? matched[1] : sourceLine;
  const leftover = (matched ? matched[2] : "")
    .replace(/^需求版本V[\d.]+重构\s*[；;]?\s*/, "")
    .trim();
  if (leftover) extras.push(leftover);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith("# ") || line.startsWith("来源：") || line.startsWith("图谱场景：")) continue;
    extras.push(line.trim());
  }
  const scene = existingScene || (scenes ? `图谱场景：${scenes}` : "");
  const parts = [title];
  if (source) parts.push("", source);
  if (scene) parts.push(scene);
  parts.push(...extras);
  return parts.join("\n");
}

export function normalizeCaseMarkdown(markdown: string, scenes = ""): string {
  const items = parseItems(markdown);
  if (!items.length) return markdown;
  const header = normalizeCaseFileHeader(markdown.slice(0, items[0].start), scenes);
  const blocks = items.map((item) => `### ${item.id} ${item.title}\n${normalizeCaseItemBody(item.body)}`);
  return `${header}\n\n${blocks.join("\n\n")}\n`;
}
