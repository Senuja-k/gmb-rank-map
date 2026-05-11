/**
 * GET  /api/gbp/connect/accounts
 *   → Lists all Google accounts stored in Supabase.
 *
 * DELETE /api/gbp/connect/accounts?email=xxx
 *   → Disconnects a Google account (removes its tokens).
 */
import { NextResponse } from "next/server";
import { listConnectedAccounts, disconnectAccount } from "@/lib/gbp-auth";

export async function GET() {
  try {
    const accounts = await listConnectedAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "email query param required." }, { status: 400 });
  }

  try {
    await disconnectAccount(email);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
