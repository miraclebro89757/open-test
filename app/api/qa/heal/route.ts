import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { keepHeal, listPendingHeals, readVersionText } from "@/lib/qa/runner";

/** Pending self-heal versions with the text of both sides, so the page can show what changed. */
export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    const entries = listPendingHeals(resolved.workspace).map((entry) => {
      let beforeText = "";
      let afterText = "";
      try {
        beforeText = readVersionText(resolved.workspace, entry.before);
        afterText = readVersionText(resolved.workspace, entry.after);
      } catch {
        // A version file removed by hand: the entry is still listed so it can be cleared.
      }
      return { ...entry, beforeText, afterText };
    });
    return NextResponse.json({ entries });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, before, keep: "before" | "after" } keeps one side and clears the entry. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    if (typeof payload.before !== "string" || (payload.keep !== "before" && payload.keep !== "after")) {
      return NextResponse.json({ error: "before and keep (before|after) are required" }, { status: 400 });
    }
    return NextResponse.json(keepHeal(resolved.workspace, payload.before, payload.keep));
  } catch (error) {
    return qaError(error, 400);
  }
}
