/**
 * GET /api/gbp/auth
 * Redirects the browser to Google's OAuth consent screen.
 */
import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gbp-auth";

export async function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
