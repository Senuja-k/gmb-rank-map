import { NextResponse } from "next/server";
import { createAdminClient, requireAdminProfile } from "@/lib/supabase-server";
import { canChangeRole, canDisableRole } from "@/lib/rbac";

export async function PATCH(req, { params }) {
  try {
    const actor = await requireAdminProfile();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const admin = createAdminClient();
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, email, role, is_active")
      .eq("id", id)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const changes = {};
    if (body.role && body.role !== target.role) {
      if (!canChangeRole(actor.role, target.role, body.role)) {
        return NextResponse.json({ error: "You cannot change this role." }, { status: 403 });
      }
      changes.role = body.role;
    }

    if (typeof body.is_active === "boolean" && body.is_active !== target.is_active) {
      if (body.is_active === false) {
        if (actor.id === id) {
          return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
        }
        if (!canDisableRole(actor.role, target.role)) {
          return NextResponse.json({ error: "You cannot disable this user." }, { status: 403 });
        }
      } else if (actor.role !== "super_admin" && target.role !== "user") {
        return NextResponse.json({ error: "Only super admins can reactivate admins." }, { status: 403 });
      }
      changes.is_active = body.is_active;
    }

    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ user: target });
    }

    const { data: updated, error } = await admin
      .from("profiles")
      .update(changes)
      .eq("id", id)
      .select("id, email, role, created_at, created_by, is_active")
      .single();

    if (error) throw error;

    if (Object.hasOwn(changes, "is_active")) {
      const { error: authError } = await admin.auth.admin.updateUserById(id, {
        ban_duration: changes.is_active ? "none" : "876000h",
      });
      if (authError) throw authError;
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
  }
}
