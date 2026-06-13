/**
 * GET  /api/gbp/reviews/prompt
 * Returns the saved AI reply instruction for reviews.
 *
 * PATCH /api/gbp/reviews/prompt
 * Body: { prompt: string }
 * Saves the instruction to app_settings.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "review_prompt")
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = row not found — safe to treat as empty
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ prompt: data?.value ?? "" });
}

export async function PATCH(request) {
  const supabase = createAdminClient();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { prompt } = body;
  if (typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt must be a string." }, { status: 400 });
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "review_prompt", value: prompt }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
