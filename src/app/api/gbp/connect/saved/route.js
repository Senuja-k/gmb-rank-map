/**
 * GET /api/gbp/connect/saved
 * Returns all enabled locations from Supabase (used by LocationPicker).
 */
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("gbp_locations")
    .select("location_name, account_name, display_name, address, google_email, is_enabled")
    .order("display_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ locations: data ?? [] });
}
