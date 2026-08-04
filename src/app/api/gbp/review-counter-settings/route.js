import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

const SETTINGS_KEY = "review_counter_company_settings";

function parseSettings(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ companySettings: parseSettings(data?.value) });
}

export async function PATCH(request) {
  const supabase = createAdminClient();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const companySettings = body?.companySettings;
  if (!companySettings || typeof companySettings !== "object" || Array.isArray(companySettings)) {
    return NextResponse.json({ error: "companySettings must be an object." }, { status: 400 });
  }

  const cleaned = {};
  for (const [locationName, value] of Object.entries(companySettings)) {
    cleaned[locationName] = String(value ?? "").trim();
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: JSON.stringify(cleaned) }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, companySettings: cleaned });
}
