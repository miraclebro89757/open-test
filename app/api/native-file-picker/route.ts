import { NextResponse } from "next/server";
import { nativeFilePickerAvailability } from "@/lib/native-file-picker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lets the upload button open Finder on this computer, or the browser picker elsewhere. */
export function GET(request: Request) {
  const availability = nativeFilePickerAvailability(request.headers.get("host"), process.platform);
  return NextResponse.json({ ...availability, platform: process.platform });
}
