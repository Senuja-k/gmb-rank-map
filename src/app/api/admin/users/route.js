import { NextResponse } from "next/server";
import { createAdminClient, requireAdminProfile } from "@/lib/supabase-server";
import { canCreateRole } from "@/lib/rbac";

async function findAuthUserByEmail(admin, email) {
  const targetEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((item) => item.email?.toLowerCase() === targetEmail);
    if (user) return user;
    if (data.users.length < 1000) break;
  }

  return null;
}

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
      user_metadata: { must_choose_password: true },
    });

    let authUser = data?.user;
    if (error || !authUser) {
      if (!error?.message?.toLowerCase().includes("already been registered")) {
        return NextResponse.json({ error: error?.message ?? "Could not create user." }, { status: 400 });
      }

      authUser = await findAuthUserByEmail(admin, email);
      if (!authUser) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const { data: existingProfile, error: existingProfileError } = await admin
        .from("profiles")
        .select("id")
        .eq("id", authUser.id)
        .maybeSingle();

      if (existingProfileError) throw existingProfileError;
      if (existingProfile) {
        return NextResponse.json({ error: "A user with this email address has already been registered." }, { status: 400 });
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        ban_duration: "none",
        user_metadata: { must_choose_password: true },
      });
      if (updateError) throw updateError;
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        id: authUser.id,
        email,
        role,
        created_by: actor.id,
        is_active: true,
      })
      .select("id, email, role, created_at, created_by, is_active")
      .single();

    if (profileError) {
      if (authUser.id === data?.user?.id) {
        await admin.auth.admin.deleteUser(authUser.id);
      }
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ user: profile }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
  }
}
