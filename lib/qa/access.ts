import fs from "node:fs";
import { NextResponse, type NextRequest } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";

/**
 * The product workspace a QA API call works on: the `cwd` of a Pi Web project,
 * held to the same rule as every file route (it must be a directory Pi Web
 * already knows from a session or an opened project).
 */
export async function resolveQaWorkspace(
  request: NextRequest,
  explicitCwd?: unknown,
): Promise<{ workspace: string } | { response: NextResponse }> {
  const raw = typeof explicitCwd === "string" ? explicitCwd : request.nextUrl.searchParams.get("cwd");
  const cwd = raw?.trim() ?? "";
  if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
    return { response: NextResponse.json({ error: "cwd must be an absolute path" }, { status: 400 }) };
  }
  const allowedRoots = await getAllowedFileRoots();
  if (!isFilePathAllowed(cwd, allowedRoots)) {
    return { response: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(cwd);
  } catch {
    return { response: NextResponse.json({ error: "Directory not found" }, { status: 404 }) };
  }
  if (!stat.isDirectory()) {
    return { response: NextResponse.json({ error: "Not a directory" }, { status: 400 }) };
  }
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return { response: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  }
  return { workspace: cwd };
}

export function qaError(error: unknown, status = 500): NextResponse {
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
}
