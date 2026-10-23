import { NextRequest, NextResponse } from "next/server";

const LOCALES = new Set(["en", "zh-CN", "zh-TW"]);

/** The browser stores the language. The agent process reads it when it builds a dialog. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { locale?: unknown } | null;
  const locale = body && typeof body.locale === "string" ? body.locale : "";
  if (!LOCALES.has(locale)) return NextResponse.json({ error: "locale" }, { status: 400 });
  process.env.OPENTEST_UI_LOCALE = locale;
  return NextResponse.json({ locale });
}

export async function GET() {
  const locale = process.env.OPENTEST_UI_LOCALE;
  return NextResponse.json({ locale: LOCALES.has(locale ?? "") ? locale : null });
}
