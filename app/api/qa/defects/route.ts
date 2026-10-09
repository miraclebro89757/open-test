import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { defectSetup, readDefects, syncDefects } from "@/lib/qa/defects";

/** The defects read so far and which credentials are still missing. */
export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({ setup: defectSetup(), defects: readDefects(resolved.workspace) });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, source?: "auto" | "zentao" | "jira" } reads defects with the server's credentials. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    const source = payload.source === "zentao" || payload.source === "jira" ? payload.source : "auto";
    const result = await syncDefects(resolved.workspace, { source });
    return NextResponse.json({ ...result, defects: readDefects(resolved.workspace), setup: defectSetup() });
  } catch (error) {
    // The upstream error carries a status such as "禅道返回 HTTP 401", never the token.
    return qaError(error, 502);
  }
}
