/**
 * GET /api/gbp/reviews
 * Returns unresponded reviews from all saved+enabled GBP locations by default.
 * Pass ?view=all to include replied reviews too.
 * Each review is augmented with locationName, locationDisplayName, and email.
 */
import { NextResponse } from "next/server";
import { fetchReviewsForLocation } from "@/lib/gbp";
import { createAdminClient } from "@/lib/supabase-server";

const LOCATION_BATCH_SIZE = 3;
const LOCATION_FETCH_TIMEOUT_MS = 25000;

function timeoutAfter(ms, label) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timed out loading reviews for ${label}`)), ms);
  });
}

async function fetchLocationReviews(loc, onlyUnreplied) {
  const parent = loc.location_name.startsWith("accounts/")
    ? loc.location_name
    : `${loc.account_name}/${loc.location_name}`;
  const reviews = await Promise.race([
    fetchReviewsForLocation(loc.google_email, parent, { onlyUnreplied }),
    timeoutAfter(LOCATION_FETCH_TIMEOUT_MS, loc.display_name ?? loc.location_name),
  ]);

  return reviews.map((r) => ({
    ...r,
    locationName: loc.location_name,
    locationDisplayName: loc.display_name,
    email: loc.google_email,
  }));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") === "all" ? "all" : "unresponded";
    const onlyUnreplied = view !== "all";
    const supabase = createAdminClient();
    const { data: locations, error } = await supabase
      .from("gbp_locations")
      .select("location_name, account_name, display_name, google_email")
      .eq("is_enabled", true);

    if (error) throw new Error(error.message);
    if (!locations?.length) return NextResponse.json({ reviews: [] });

    const results = [];
    for (let i = 0; i < locations.length; i += LOCATION_BATCH_SIZE) {
      const batch = locations.slice(i, i + LOCATION_BATCH_SIZE);
      const batchResults = await Promise.allSettled(batch.map((loc) => fetchLocationReviews(loc, onlyUnreplied)));
      results.push(...batchResults.map((result, index) => ({ result, location: batch[index] })));
    }

    const reviews = results
      .filter(({ result }) => result.status === "fulfilled")
      .flatMap(({ result }) => result.value);

    const fetchErrors = results
      .map(({ result, location }) => result.status === "rejected" ? `${location.display_name}: ${result.reason?.message ?? result.reason}` : null)
      .filter(Boolean);

    return NextResponse.json({ view, reviews, fetchErrors: fetchErrors.length ? fetchErrors : undefined });
  } catch (err) {
    console.error("[GBP reviews list]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
