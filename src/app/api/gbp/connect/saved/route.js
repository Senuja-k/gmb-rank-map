/**
 * GET /api/gbp/connect/saved
 * Returns all enabled locations from Supabase (used by LocationPicker).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  // Try with cta_url first; fall back without it if the column doesn't exist yet
  let { data, error } = await supabase
    .from("gbp_locations")
    .select("location_name, account_name, display_name, address, google_email, is_enabled, cta_url")
    .order("display_name");

  if (error?.message?.includes("cta_url")) {
    ({ data, error } = await supabase
      .from("gbp_locations")
      .select("location_name, account_name, display_name, address, google_email, is_enabled")
      .order("display_name"));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ locations: data ?? [] });
}
