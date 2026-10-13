import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { isWorkPolicy, readPolicy, writePolicy } from "@/lib/qa/policy";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json(readPolicy(resolved.workspace));
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, mode }. mode is guided, balanced, or autonomous. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as { cwd?: string; mode?: unknown };
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    if (!isWorkPolicy(payload.mode)) {
      return NextResponse.json({ error: "mode 必须是 guided、balanced 或 autonomous" }, { status: 400 });
    }
    return NextResponse.json(writePolicy(resolved.workspace, payload.mode));
  } catch (error) {
    return qaError(error);
  }
}
