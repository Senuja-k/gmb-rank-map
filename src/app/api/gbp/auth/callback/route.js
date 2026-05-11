/**
 * GET /api/gbp/auth/callback?code=xxx
 * Exchanges the OAuth code for tokens, stores them, then redirects to /gbp/connect.
 */
import { NextResponse } from "next/server";
import { exchangeCodeAndSave } from "@/lib/gbp-auth";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code param." }, { status: 400 });
  }

  try {
    const email = await exchangeCodeAndSave(code);
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    return NextResponse.redirect(
      `${base}/gbp/connect?connected=${encodeURIComponent(email)}`
    );
  } catch (err) {
    console.error("[GBP auth/callback]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
