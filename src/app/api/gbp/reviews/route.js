/**
 * GET /api/gbp/reviews
 * Returns all reviews from all saved+enabled GBP locations.
 * Each review is augmented with locationName, locationDisplayName, and email.
 */
import { NextResponse } from "next/server";
import { fetchReviewsForLocation } from "@/lib/gbp";
import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: locations, error } = await supabase
      .from("gbp_locations")
      .select("location_name, account_name, display_name, google_email")
      .eq("is_enabled", true);

    if (error) throw new Error(error.message);
    if (!locations?.length) return NextResponse.json({ reviews: [] });

    const results = await Promise.allSettled(
      locations.map(async (loc) => {
        const parent = loc.location_name.startsWith("accounts/")
          ? loc.location_name
          : `${loc.account_name}/${loc.location_name}`;
        const reviews = await fetchReviewsForLocation(loc.google_email, parent);
        return reviews.map((r) => ({
          ...r,
          locationName: loc.location_name,
          locationDisplayName: loc.display_name,
          email: loc.google_email,
        }));
      })
    );

    const reviews = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value);

    const fetchErrors = results
      .map((r, i) => r.status === "rejected" ? `${locations[i].display_name}: ${r.reason?.message ?? r.reason}` : null)
      .filter(Boolean);

    return NextResponse.json({ reviews, fetchErrors: fetchErrors.length ? fetchErrors : undefined });
  } catch (err) {
    console.error("[GBP reviews list]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
