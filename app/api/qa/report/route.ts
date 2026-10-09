import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { previewBrief, writeBrief } from "@/lib/qa/brief";

/** What the brief would say now, without writing it. */
export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({ brief: previewBrief(resolved.workspace) });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, name? } writes reports/<name>.md from the files in the workspace. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    const written = writeBrief(resolved.workspace, typeof payload.name === "string" ? payload.name : undefined);
    return NextResponse.json({ file: written.file, relative: written.relative, brief: written.brief });
  } catch (error) {
    return qaError(error);
  }
}
