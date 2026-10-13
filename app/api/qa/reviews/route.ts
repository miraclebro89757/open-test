import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { ReviewError } from "@/lib/qa/review";
import { acceptBulk, applyBaseline, blockedFeatureNames, decideReview, listReviews } from "@/lib/qa/reviews";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    const items = listReviews(resolved.workspace);
    return NextResponse.json({ items, blocked: blockedFeatureNames(items) });
  } catch (error) {
    return qaError(error);
  }
}

/**
 * Body: { cwd, action, id?, decision?, note?, fingerprint? }.
 * action is decide, accept-bulk, or apply-baseline.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      cwd?: string;
      action?: string;
      id?: string;
      decision?: string;
      note?: string;
      fingerprint?: string;
    };
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    if (payload.action === "accept-bulk") {
      return NextResponse.json(acceptBulk(resolved.workspace));
    }
    if (payload.action === "apply-baseline") {
      return NextResponse.json({ plan: applyBaseline(resolved.workspace) });
    }
    if (payload.action === "decide") {
      const item = decideReview(
        resolved.workspace,
        String(payload.id ?? ""),
        String(payload.decision ?? ""),
        typeof payload.note === "string" ? payload.note : "",
        typeof payload.fingerprint === "string" ? payload.fingerprint : "",
      );
      return NextResponse.json({ item });
    }
    return NextResponse.json({ error: "action 必须是 decide、accept-bulk 或 apply-baseline" }, { status: 400 });
  } catch (error) {
    return qaError(error, error instanceof ReviewError ? error.status : 409);
  }
}
