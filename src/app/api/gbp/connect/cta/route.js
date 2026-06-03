/**
 * GET  /api/gbp/connect/cta
 * Returns the common CTA URL and each location's individual CTA URL.
 *
 * PATCH /api/gbp/connect/cta
 * Body: {
 *   commonCtaUrl?: string,
 *   locationCtas?: [{ locationName: string, ctaUrl: string }]
 * }
 */
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const [settingsRes, locsRes] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "common_cta_url").single(),
    supabase.from("gbp_locations").select("location_name, display_name, cta_url").order("display_name"),
  ]);

  // If either table doesn't exist yet (migration not run), return safe defaults
  return NextResponse.json({
    commonCtaUrl: settingsRes.data?.value ?? "",
    locations: locsRes.error ? [] : (locsRes.data ?? []),
  });
}

export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { commonCtaUrl, locationCtas } = body;
  const ops = [];

  if (typeof commonCtaUrl === "string") {
    ops.push(
      supabase
        .from("app_settings")
        .upsert({ key: "common_cta_url", value: commonCtaUrl }, { onConflict: "key" })
    );
  }

  if (Array.isArray(locationCtas)) {
    for (const { locationName, ctaUrl } of locationCtas) {
      ops.push(
        supabase
          .from("gbp_locations")
          .update({ cta_url: ctaUrl ?? "" })
          .eq("location_name", locationName)
      );
    }
  }

  const results = await Promise.all(ops);
  const failed = results.filter((r) => r.error);
  if (failed.length) {
    return NextResponse.json({ error: failed[0].error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
