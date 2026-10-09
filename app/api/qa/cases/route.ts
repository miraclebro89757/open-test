import { NextRequest, NextResponse } from "next/server";
import { readCases } from "@/lib/qa/assets";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { ReviewError, editItem } from "@/lib/qa/review";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({ files: readCases(resolved.workspace) });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, file, id, title?, body? } edits one case in place. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    if (typeof payload.id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });
    return NextResponse.json(editItem(resolved.workspace, "cases", payload.file as string, {
      id: payload.id,
      title: typeof payload.title === "string" ? payload.title : undefined,
      body: typeof payload.body === "string" ? payload.body : undefined,
    }));
  } catch (error) {
    return qaError(error, error instanceof ReviewError ? error.status : 500);
  }
}
