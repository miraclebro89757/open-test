import { basename } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";
import { readCases } from "@/lib/qa/assets";
import {
  dingTalkExcelMcpConfigured,
  inferWorkspaceVersion,
  readCaseSheetBinding,
  syncCaseSheet,
} from "@/lib/qa/case-sheet";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    const cases = readCases(resolved.workspace).flatMap((file) => file.items);
    return NextResponse.json({
      binding: readCaseSheetBinding(resolved.workspace),
      mcpConfigured: dingTalkExcelMcpConfigured(),
      version: inferWorkspaceVersion(resolved.workspace),
      caseCount: cases.length,
    });
  } catch (error) {
    return qaError(error);
  }
}

/** Body: { cwd, action: "push" | "pull", url? }. */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as { cwd?: string; action?: string; url?: string };
    const resolved = await resolveQaWorkspace(request, payload.cwd);
    if ("response" in resolved) return resolved.response;
    const action = payload.action === "pull" ? "pull" : "push";
    const url = String(payload.url ?? "").trim();
    const result = await syncCaseSheet(resolved.workspace, action, {
      product: basename(resolved.workspace),
      url: url || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missing = /钉钉表格 MCP/.test(message);
    return qaError(error, missing ? 409 : 500);
  }
}
