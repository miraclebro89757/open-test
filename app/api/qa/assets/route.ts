import { NextRequest, NextResponse } from "next/server";
import { WORKSPACE_DIRS, listAssetFiles, type WorkspaceDir } from "@/lib/qa/assets";
import { qaError, resolveQaWorkspace } from "@/lib/qa/access";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveQaWorkspace(request);
    if ("response" in resolved) return resolved.response;
    const dir = request.nextUrl.searchParams.get("dir") ?? "";
    if (!(WORKSPACE_DIRS as readonly string[]).includes(dir)) {
      return NextResponse.json({ error: `dir must be one of ${WORKSPACE_DIRS.join(", ")}` }, { status: 400 });
    }
    return NextResponse.json({ dir, files: listAssetFiles(resolved.workspace, dir as WorkspaceDir) });
  } catch (error) {
    return qaError(error);
  }
}
