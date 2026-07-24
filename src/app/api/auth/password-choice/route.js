import { NextResponse } from "next/server";
import { createAdminClient, getCurrentUser } from "@/lib/supabase-server";

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { action, newPassword } = await req.json().catch(() => ({}));
  if (!["keep", "change"].includes(action)) {
    return NextResponse.json({ error: "Choose whether to keep or change the password." }, { status: 400 });
  }
  if (action === "change" && (!newPassword || newPassword.length < 8)) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const admin = createAdminClient();
  const metadata = { ...(user.user_metadata ?? {}), must_choose_password: false };
  const updates = { user_metadata: metadata };

  if (action === "change") {
    updates.password = newPassword;
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, updates);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
