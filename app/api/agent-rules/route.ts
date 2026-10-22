import { NextRequest, NextResponse } from "next/server";
import { AgentRulesError, readAgentRules, writeAgentRules } from "@/lib/agent-rules";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { getAgentDir } from "@/lib/session-reader";

function rulesError(error: unknown): NextResponse {
  if (error instanceof AgentRulesError) {
    const status = error.code === "too-large" ? 413 : error.code === "missing-directory" ? 404 : 400;
    return NextResponse.json({ error: error.code }, { status });
  }
  return qaError(error);
}

export async function GET(request: NextRequest) {
  try {
    const global = readAgentRules(getAgentDir());
    const raw = request.nextUrl.searchParams.get("cwd")?.trim() ?? "";
    if (!raw) return NextResponse.json({ global, project: null });
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({ global, project: readAgentRules(resolved.workspace) });
  } catch (error) {
    return rulesError(error);
  }
}

/** Body: { scope: "global" | "project", content: string, cwd?: string }. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as { scope?: unknown; content?: unknown; cwd?: unknown };
    if (typeof payload.content !== "string") {
      return NextResponse.json({ error: "content" }, { status: 400 });
    }
    if (payload.scope === "global") {
      return NextResponse.json({ rules: writeAgentRules(getAgentDir(), payload.content) });
    }
    if (payload.scope === "project") {
      const resolved = await resolveQaWorkspace(request, payload.cwd);
      if ("response" in resolved) return resolved.response;
      return NextResponse.json({ rules: writeAgentRules(resolved.workspace, payload.content) });
    }
    return NextResponse.json({ error: "scope" }, { status: 400 });
  } catch (error) {
    return rulesError(error);
  }
}
