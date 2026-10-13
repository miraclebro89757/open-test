import { NextRequest, NextResponse } from "next/server";
import { listMarkdownFiles } from "@/lib/qa/assets";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { applyClarificationUpdate, readClarificationDocuments } from "@/lib/qa/clarifications";
import { compactIfDue } from "@/lib/qa/lessons";
import { ReviewError } from "@/lib/qa/review";
import { appendReviewLog, spreadRecordedLesson } from "@/lib/qa/reviews";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    const documents = readClarificationDocuments(resolved.workspace);
    const marked = new Set(documents.map((document) => document.file));
    const otherFiles = listMarkdownFiles(resolved.workspace, "knowledge").filter((file) => {
      const relative = file.replace(/\\/g, "/");
      return !marked.has(file) && !relative.includes("/source-pack/");
    });
    return NextResponse.json({ documents, otherFiles });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, file, id, status, supplement }. Status is 待处理, 忽略, 已补充 or 待讨论. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    const { item, lesson } = applyClarificationUpdate(
      resolved.workspace,
      String(payload.file ?? ""),
      String(payload.id ?? ""),
      payload.status,
      payload.supplement,
    );
    appendReviewLog(resolved.workspace, {
      id: `${payload.file}:${payload.id}`,
      source: "clarification",
      decision: payload.status,
      title: item.title,
      ...(lesson ? { lesson: lesson.id } : {}),
    });
    compactIfDue(resolved.workspace);
    if (lesson) spreadRecordedLesson(resolved.workspace, lesson);
    return NextResponse.json({ item, lesson });
  } catch (error) {
    return qaError(error, error instanceof ReviewError ? error.status : 500);
  }
}
