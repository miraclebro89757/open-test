import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { readQaOverview } from "@/lib/qa/overview";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json(readQaOverview(resolved.workspace));
  } catch (error) {
    return qaError(error);
  }
}
