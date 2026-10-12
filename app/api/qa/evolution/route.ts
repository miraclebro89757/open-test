import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { applyEvolutionPlan, readEvolutionPlan, type EvolutionDecision } from "@/lib/qa/evolution";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    return NextResponse.json({ plan: readEvolutionPlan(resolved.workspace) });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, decisions: [{ asset_id, action }] }. Applies a reviewed migration. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as { cwd?: string; decisions?: EvolutionDecision[] };
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    const plan = applyEvolutionPlan(resolved.workspace, Array.isArray(payload.decisions) ? payload.decisions : []);
    return NextResponse.json({ plan });
  } catch (error) {
    return qaError(error, 409);
  }
}
