/**
 * POST /api/gbp/connect/save
 * Upserts a list of locations into Supabase.
 *
 * Body: {
 *   email: string,
 *   locations: [{ locationName, accountName, displayName, address, isEnabled }]
 * }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export async function POST(request) {
  const supabase = createAdminClient();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { email, locations } = body;
  if (!email || !Array.isArray(locations)) {
    return NextResponse.json(
      { error: "Required: email (string), locations (array)." },
      { status: 400 }
    );
  }

  const rawRows = locations.map((loc) => ({
    location_name: loc.locationName,
    account_name: loc.accountName,
    display_name: loc.displayName,
    address: loc.address ?? "",
    google_email: email,
    is_enabled: loc.isEnabled ?? true,
  }));

  // Deduplicate by location_name before upsert to avoid
  // "ON CONFLICT DO UPDATE command cannot affect a row a second time"
  const rowMap = new Map();
  rawRows.forEach((row) => rowMap.set(row.location_name, row));
  const rows = Array.from(rowMap.values());

  const { error } = await supabase
    .from("gbp_locations")
    .upsert(rows, { onConflict: "location_name" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, saved: rows.length });
}
