import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { compactLessons, readLessons, splitKeywords, updateLesson } from "@/lib/qa/lessons";
import { ReviewError } from "@/lib/qa/review";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({ items: readLessons(resolved.workspace) });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, action, id?, ...fields }. action is update or compact. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    if (payload.action === "compact") {
      return NextResponse.json(compactLessons(resolved.workspace));
    }
    if (payload.action === "update") {
      const keywords = Array.isArray(payload.keywords)
        ? payload.keywords.map(String)
        : typeof payload.keywords === "string"
          ? splitKeywords(payload.keywords)
          : undefined;
      const lesson = updateLesson(resolved.workspace, String(payload.id ?? ""), {
        title: typeof payload.title === "string" ? payload.title : undefined,
        status: typeof payload.status === "string" ? payload.status as "待确认" | "已启用" | "停用" : undefined,
        scope: payload.scope === "全部产品" || payload.scope === "本产品" ? payload.scope : undefined,
        condition: typeof payload.condition === "string" ? payload.condition : undefined,
        action: typeof payload.how === "string" ? payload.how : typeof payload.actionText === "string" ? payload.actionText : undefined,
        decision: typeof payload.decision === "string" ? payload.decision : undefined,
        keywords,
      });
      return NextResponse.json({ lesson, items: readLessons(resolved.workspace) });
    }
    return NextResponse.json({ error: "action must be update or compact" }, { status: 400 });
  } catch (error) {
    return qaError(error, error instanceof ReviewError ? error.status : 409);
  }
}
