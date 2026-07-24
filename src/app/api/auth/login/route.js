import { NextResponse } from "next/server";
import { createAnonServerClient, createAdminClient, setAuthCookies } from "@/lib/supabase-server";

export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const supabase = createAnonServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return NextResponse.json({ error: "This account is not active." }, { status: 403 });
  }

  const response = NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
    session: data.session,
    profile,
    mustChoosePassword: data.user.user_metadata?.must_choose_password === true,
  });
  setAuthCookies(response, data.session);
  return response;
}
