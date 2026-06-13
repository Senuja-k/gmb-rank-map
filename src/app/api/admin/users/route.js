import { NextResponse } from "next/server";
import { createAdminClient, requireAdminProfile } from "@/lib/supabase-server";
import { canCreateRole } from "@/lib/rbac";

export async function GET() {
  try {
    await requireAdminProfile();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, role, created_at, created_by, is_active")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ users: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
  }
}

export async function POST(req) {
  try {
    const actor = await requireAdminProfile();
    const { email, password, role = "user" } = await req.json().catch(() => ({}));

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    if (!canCreateRole(actor.role, role)) {
      return NextResponse.json({ error: "You cannot create a user with that role." }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? "Could not create user." }, { status: 400 });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        id: data.user.id,
        email,
        role,
        created_by: actor.id,
        is_active: true,
      })
      .select("id, email, role, created_at, created_by, is_active")
      .single();

    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ user: profile }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
  }
}
