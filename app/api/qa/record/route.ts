import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { casesToRecord, listRecordings, readSandbox, saveSandboxUrl } from "@/lib/qa/recordings";

/** What the recording wizard needs: the sandbox address, the cases still to cover, and earlier recordings. */
export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({
      sandbox: readSandbox(resolved.workspace),
      cases: casesToRecord(resolved.workspace),
      recordings: listRecordings(resolved.workspace),
    });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, sandboxUrl } saves the default sandbox address in opentest.sandbox.json. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    if (typeof payload.sandboxUrl !== "string") return NextResponse.json({ error: "sandboxUrl is required" }, { status: 400 });
    saveSandboxUrl(resolved.workspace, payload.sandboxUrl.trim());
    return NextResponse.json({ sandbox: readSandbox(resolved.workspace) });
  } catch (error) {
    return qaError(error, 400);
  }
}
