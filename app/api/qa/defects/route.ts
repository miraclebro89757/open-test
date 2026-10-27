import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { defectSetup, readDefects } from "@/lib/qa/defects";

/** Saved defects and the bug-tracker MCP servers connected in settings. */
export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({
      setup: defectSetup(resolved.workspace),
      defects: readDefects(resolved.workspace),
    });
  } catch (error) {
    return qaError(error);
  }
}
