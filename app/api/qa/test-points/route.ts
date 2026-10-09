import { NextRequest, NextResponse } from "next/server";
import { readTestPoints } from "@/lib/qa/assets";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { ReviewError, applyPointAction, editItem } from "@/lib/qa/review";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({ files: readTestPoints(resolved.workspace) });
  } catch (error) {
    return qaError(error);
  }
}

/**
 * Body: { cwd, file, action: "confirm" | "unconfirm", ids } or { cwd, file, action: "confirm-all" }
 * or { cwd, file, action: "edit", id, title?, body? }.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    const file = payload.file as string;
    switch (payload.action) {
      case "confirm":
      case "unconfirm": {
        const ids = Array.isArray(payload.ids) ? payload.ids.filter((id): id is string => typeof id === "string") : [];
        return NextResponse.json(applyPointAction(resolved.workspace, file, { action: payload.action, ids }));
      }
      case "confirm-all":
        return NextResponse.json(applyPointAction(resolved.workspace, file, { action: "confirm-all" }));
      case "edit": {
        if (typeof payload.id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });
        return NextResponse.json(editItem(resolved.workspace, "test-points", file, {
          id: payload.id,
          title: typeof payload.title === "string" ? payload.title : undefined,
          body: typeof payload.body === "string" ? payload.body : undefined,
        }));
      }
      default:
        return NextResponse.json({ error: "action must be confirm, unconfirm, confirm-all or edit" }, { status: 400 });
    }
  } catch (error) {
    return qaError(error, error instanceof ReviewError ? error.status : 500);
  }
}
