import { basename } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { checkpointModule } from "@/lib/qa/legacy";
import { dingTalkMcpConfigured, ingestRequirementSources, readSourcePack } from "@/lib/qa/source-pack";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({
      pack: readSourcePack(resolved.workspace),
      mcpConfigured: dingTalkMcpConfigured(),
    });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, url, depth? }. Collects the DingTalk tree into knowledge/source-pack/. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as { cwd?: string; url?: string; depth?: number };
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    const url = String(payload.url ?? "").trim();
    if (!url) return NextResponse.json({ error: "A DingTalk document link is required" }, { status: 400 });
    const result = await ingestRequirementSources(resolved.workspace, url, {
      product: basename(resolved.workspace),
      depth: typeof payload.depth === "number" ? payload.depth : 2,
    });
    checkpointModule().updateCheckpoint(resolved.workspace, {
      product: basename(resolved.workspace),
      sourceFile: url,
      action: "status",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missing = /钉钉文档 MCP/.test(message);
    return qaError(error, missing ? 409 : 500);
  }
}
