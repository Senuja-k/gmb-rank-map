/**
 * PATCH /api/gbp/connect/toggle
 * Toggle the is_enabled flag for a saved location.
 *
 * Body: { locationName: string, isEnabled: boolean }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export async function PATCH(request) {
  const supabase = createAdminClient();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { locationName, isEnabled } = body;
  if (!locationName || typeof isEnabled !== "boolean") {
    return NextResponse.json(
      { error: "Required: locationName (string), isEnabled (boolean)." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("gbp_locations")
    .update({ is_enabled: isEnabled })
    .eq("location_name", locationName);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
