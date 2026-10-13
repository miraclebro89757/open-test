import { parseItems } from "./markdown";

// Client-safe: the lesson file format and the matching rule. No node imports.

export const LESSON_STATUSES = ["待确认", "已启用", "停用"] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];
export const LESSON_TARGETS = ["待澄清", "测试点", "用例"] as const;
export type LessonTarget = (typeof LESSON_TARGETS)[number];
export type LessonScope = "本产品" | "全部产品";

/** Two overturns turn a lesson off; a person can turn it back on. */
export const OVERTURN_LIMIT = 2;

export interface Lesson {
  id: string;
  title: string;
  status: LessonStatus;
  scope: LessonScope;
  target: LessonTarget;
  condition: string;
  action: string;
  /** For 待澄清: the status to write, 已补充, 忽略 or 待讨论. */
  decision: string;
  keywords: string[];
  origin: string;
  hits: number;
  overturned: number;
}

export interface LessonInput {
  title: string;
  scope: LessonScope;
  target: LessonTarget;
  condition: string;
  action: string;
  decision: string;
  keywords: string[];
  origin: string;
  status?: LessonStatus;
}

/** How many review-log lines trigger a merge of the lesson files. */
export const COMPACT_EVERY = 100;

/**
 * Document-writing conventions that are the same in every product.
 * Feature names and business rules stay out of this list.
 */
export const GLOBAL_CONVENTION = /删除线|划掉|划线删除|以截图为准|以图为准|正文未含|附件未含|不用测试|不写测试/;

export function classifyLessonScope(note: string, question = ""): LessonScope {
  if (GLOBAL_CONVENTION.test(note)) return "全部产品";
  if (!note.trim() && GLOBAL_CONVENTION.test(question)) return "全部产品";
  return "本产品";
}

export const LESSON_FILE_HEADER = [
  "# 审核经验",
  "",
  "测试人员在待审核里做过的决定，由系统自动记成可以复用的经验。文档写法（删除线、以截图为准、不用测试）记在全部产品；项目逻辑记在本产品。",
  "Agent 写待澄清、测试点和用例前读这份文件，只按「已启用」的经验处理。可以追加状态为「待确认」的经验，不要自己改成已启用，也不要改命中和推翻的次数。满 100 条审核记录后系统会合并这份文件。",
  "",
].join("\n");

function asNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function splitKeywords(value: string): string[] {
  return [...new Set(value.split(/[、,，;；\s]+/).map((word) => word.trim()).filter(Boolean))];
}

export function parseLessons(markdown: string, scope: LessonScope): Lesson[] {
  return parseItems(markdown).map((item) => {
    const fields = item.fields;
    const status = LESSON_STATUSES.includes(fields["状态"] as LessonStatus) ? fields["状态"] as LessonStatus : "待确认";
    const target = LESSON_TARGETS.includes(fields["适用"] as LessonTarget) ? fields["适用"] as LessonTarget : "待澄清";
    return {
      id: item.id,
      title: item.title,
      status,
      scope,
      target,
      condition: fields["条件"] ?? "",
      action: fields["做法"] ?? "",
      decision: fields["决定"] ?? (target === "待澄清" ? "已补充" : ""),
      keywords: splitKeywords(fields["关键词"] ?? ""),
      origin: fields["来源"] ?? "",
      hits: asNumber(fields["命中"]),
      overturned: asNumber(fields["推翻"]),
    };
  });
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export function renderLesson(id: string, input: LessonInput, counts: { hits?: number; overturned?: number } = {}): string {
  const lines = [
    `### ${id} ${oneLine(input.title)}`,
    `- 状态：${input.status ?? "已启用"}`,
    `- 范围：${input.scope}`,
    `- 适用：${input.target}`,
    `- 条件：${oneLine(input.condition)}`,
    `- 做法：${oneLine(input.action)}`,
  ];
  if (input.target === "待澄清") lines.push(`- 决定：${input.decision}`);
  lines.push(
    `- 关键词：${input.keywords.join("、")}`,
    `- 来源：${oneLine(input.origin)}`,
    `- 命中：${counts.hits ?? 0}`,
    `- 推翻：${counts.overturned ?? 0}`,
  );
  return `${lines.join("\n")}\n`;
}

export function renderStoredLesson(lesson: Lesson): string {
  return renderLesson(lesson.id, lesson, { hits: lesson.hits, overturned: lesson.overturned });
}

const CONVENTION_KEYWORD: Array<[RegExp, string]> = [
  [/删除线/, "删除线"],
  [/划掉|划线删除/, "划掉"],
  [/截图|以图为准/, "截图"],
  [/正文未含|附件未含/, "附件"],
  [/不用测试|不写测试/, "不用测试"],
];

export function conventionKeywords(text: string): string[] {
  const found: string[] = [];
  for (const [pattern, word] of CONVENTION_KEYWORD) {
    if (pattern.test(text) && !found.includes(word)) found.push(word);
  }
  return found;
}

/**
 * Turn a person's decision into a lesson, or null when there is nothing to reuse
 * (a deferral, an empty supplement, or a plain confirm).
 */
export function feedbackToLesson(input: {
  decision: string;
  note: string;
  title: string;
  evidence: string;
  target: LessonTarget;
  origin: string;
}): LessonInput | null {
  const note = input.note.trim();
  if (input.target === "待澄清") {
    if (input.decision !== "已补充" && input.decision !== "忽略") return null;
    if (input.decision === "已补充" && !note) return null;
  } else if (input.decision !== "退回" || !note) return null;
  const question = `${input.title}\n${input.evidence}`;
  const action = note || "这类问题忽略，不写测试。";
  const keywords = suggestKeywords(action, question).length
    ? suggestKeywords(action, question)
    : conventionKeywords(`${action}\n${question}`);
  return {
    title: action.replace(/[。.]$/, "").slice(0, 24),
    scope: classifyLessonScope(action, question),
    target: input.target,
    condition: (input.evidence || input.title).replace(/\s+/g, " ").slice(0, 80),
    action,
    decision: input.target === "待澄清" ? input.decision : "",
    keywords,
    origin: input.origin,
    status: "已启用",
  };
}

/**
 * Code only matches lessons that name keywords, and only when every keyword is
 * in the text. Lessons without keywords guide the agent but never match here.
 */
export function lessonMatches(lesson: Lesson, text: string, target: LessonTarget = "待澄清"): boolean {
  if (lesson.status !== "已启用" || lesson.target !== target || lesson.keywords.length === 0) return false;
  return lesson.keywords.every((word) => text.includes(word));
}

const PUNCTUATION = /[\s，。、；：:,.!?！？「」『』“”"'（）()【】\[\]《》<>-]/;
const LEAD_STOP = /的|都|一律|统一|全部|按|以|要|请|，|。|,/;

function longestCommon(a: string, b: string): string {
  let best = "";
  for (let i = 0; i < a.length; i += 1) {
    for (let j = i + best.length + 1; j <= a.length; j += 1) {
      const piece = a.slice(i, j);
      if (PUNCTUATION.test(piece)) break;
      if (b.includes(piece)) best = piece;
      else break;
    }
  }
  return best;
}

/**
 * The words a decision is about. "删除线的都按删除处理" on a question about a
 * 删除线 gives 删除线: the lead phrase of the note that also appears in the question.
 */
export function suggestKeywords(note: string, question: string): string[] {
  const text = note.trim();
  const stop = text.search(LEAD_STOP);
  const lead = stop >= 0 ? text.slice(0, stop) : text;
  const fromLead = longestCommon(lead, question);
  return fromLead.length >= 2 ? [fromLead] : [];
}
