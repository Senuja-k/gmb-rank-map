import { NextResponse } from "next/server";
import { clearAuthCookies, getCurrentProfile } from "@/lib/supabase-server";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    const response = NextResponse.json({ profile: null }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }
  return NextResponse.json({ profile });
}
