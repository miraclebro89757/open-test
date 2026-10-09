import { NextRequest, NextResponse } from "next/server";
import { listAutomationScripts } from "@/lib/qa/assets";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { listRuns, readRun } from "@/lib/qa/runs";
import { RunBusyError, startRun } from "@/lib/qa/runner";

/** ?cwd=...&id=... returns one run; without id, the recent runs and the scripts that could run. */
export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    const id = request.nextUrl.searchParams.get("id");
    if (id) {
      const run = readRun(resolved.workspace, id);
      return run ? NextResponse.json({ run }) : NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({
      runs: listRuns(resolved.workspace),
      scripts: listAutomationScripts(resolved.workspace),
    });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, files?, kind?, headed?, retries? } starts a run and returns its record at once. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    const files = Array.isArray(payload.files) && payload.files.every((file) => typeof file === "string")
      ? (payload.files as string[])
      : undefined;
    const kind = payload.kind === "ui" || payload.kind === "api" ? payload.kind : "all";
    const run = startRun(resolved.workspace, {
      files,
      kind,
      headed: payload.headed === true,
      retries: typeof payload.retries === "number" ? payload.retries : 0,
    });
    return NextResponse.json({ run });
  } catch (error) {
    if (error instanceof RunBusyError) return qaError(error, 409);
    return qaError(error, 400);
  }
}
