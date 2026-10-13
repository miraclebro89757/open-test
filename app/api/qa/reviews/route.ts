import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { saveLesson, splitKeywords, type LessonInput } from "@/lib/qa/lessons";
import { ReviewError } from "@/lib/qa/review";
import { acceptBulk, applyBaseline, applyLesson, blockedFeatureNames, decideReview, listReviews } from "@/lib/qa/reviews";

function lessonInput(raw: unknown): LessonInput {
  const value = (raw ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string).slice(0, 500) : "");
  return {
    title: text("title"),
    scope: value.scope === "全部产品" ? "全部产品" : "本产品",
    target: text("target") as LessonInput["target"],
    condition: text("condition"),
    action: text("action"),
    decision: text("decision"),
    keywords: Array.isArray(value.keywords) ? value.keywords.map(String) : splitKeywords(text("keywords")),
    origin: text("origin"),
  };
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    const items = listReviews(resolved.workspace);
    return NextResponse.json({ items, blocked: blockedFeatureNames(items) });
  } catch (error) {
    return qaError(error);
  }
}

/**
 * Body: { cwd, action, id?, decision?, note?, fingerprint? }.
 * action is decide, accept-bulk, or apply-baseline.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      cwd?: string;
      action?: string;
      id?: string;
      decision?: string;
      note?: string;
      fingerprint?: string;
      lesson?: unknown;
      lessonId?: string;
    };
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    if (payload.action === "accept-bulk") {
      return NextResponse.json(acceptBulk(resolved.workspace));
    }
    if (payload.action === "save-lesson") {
      const lesson = saveLesson(resolved.workspace, lessonInput(payload.lesson));
      const matching = listReviews(resolved.workspace).filter((item) => item.lessons.some((hint) => hint.id === lesson.id)).length;
      return NextResponse.json({ lesson, matching });
    }
    if (payload.action === "apply-lesson") {
      return NextResponse.json(applyLesson(resolved.workspace, String(payload.lessonId ?? "")));
    }
    if (payload.action === "apply-baseline") {
      return NextResponse.json({ plan: applyBaseline(resolved.workspace) });
    }
    if (payload.action === "decide") {
      const result = decideReview(
        resolved.workspace,
        String(payload.id ?? ""),
        String(payload.decision ?? ""),
        typeof payload.note === "string" ? payload.note : "",
        typeof payload.fingerprint === "string" ? payload.fingerprint : "",
      );
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "action 必须是 decide、accept-bulk、save-lesson、apply-lesson 或 apply-baseline" }, { status: 400 });
  } catch (error) {
    return qaError(error, error instanceof ReviewError ? error.status : 409);
  }
}
