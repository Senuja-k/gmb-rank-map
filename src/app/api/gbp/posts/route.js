/**
 * POST /api/gbp/posts
 *
 * Publishes a post to a single GBP location.
 *
 * Body: {
 *   email, locationName,
 *   summaryText,          // required — post body text
 *   imageUrl?,            // public image URL
 *   ctaUrl?,              // call-to-action URL
 *   topicType?,           // "STANDARD" | "OFFER" | "EVENT" (default STANDARD)
 *   eventData?,           // { title, startDate: {year,month,day}, endDate: {year,month,day} }
 *   offerData?,           // { couponCode?, redeemUrl?, terms? }
 *   // Legacy mode support:
 *   mode?,                // "generate" uses Gemini from topic field
 *   topic?,               // used when mode = "generate"
 * }
 */

import { NextResponse } from "next/server";
import { generateAndPublishPost, createGbpPost, fetchPostsForLocation } from "@/lib/gbp";
import { createAdminClient } from "@/lib/supabase-server";

/**
 * GET /api/gbp/posts
 * Returns published posts from all saved+enabled GBP locations.
 * This is read-only and is used by the live assistant.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: locations, error } = await supabase
      .from("gbp_locations")
      .select("location_name, account_name, display_name, google_email")
      .eq("is_enabled", true);

    if (error) throw new Error(error.message);
    if (!locations?.length) return NextResponse.json({ posts: [] });

    const results = await Promise.allSettled(
      locations.map(async (loc) => {
        const parent = loc.location_name.startsWith("accounts/")
          ? loc.location_name
          : `${loc.account_name}/${loc.location_name}`;
        const posts = await fetchPostsForLocation(loc.google_email, parent);
        return posts.map((p) => ({
          ...p,
          locationName: loc.location_name,
          locationDisplayName: loc.display_name,
          email: loc.google_email,
        }));
      })
    );

    const posts = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value);

    const fetchErrors = results
      .map((r, i) => r.status === "rejected" ? `${locations[i].display_name}: ${r.reason?.message ?? r.reason}` : null)
      .filter(Boolean);

    return NextResponse.json({ posts, fetchErrors: fetchErrors.length ? fetchErrors : undefined });
  } catch (err) {
    console.error("[GBP posts list]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const supabase = createAdminClient();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    mode,
    email,
    locationName,
    summaryText,
    imageUrl = "",
    ctaUrl = "",
    ctaActionType = "LEARN_MORE",
    topicType = "STANDARD",
    eventData = null,
    offerData = null,
    topic,
  } = body;

  if (!email || !locationName) {
    return NextResponse.json(
      { error: "Required fields: email, locationName." },
      { status: 400 }
    );
  }

  // The v4 mybusiness API requires the full "accounts/{id}/locations/{id}" path.
  // The DB stores location_name as just "locations/{id}" and account_name separately.
  let fullLocationPath = locationName;
  if (!locationName.startsWith("accounts/")) {
    const { data: locRow } = await supabase
      .from("gbp_locations")
      .select("account_name")
      .eq("location_name", locationName)
      .single();
    if (locRow?.account_name) {
      fullLocationPath = `${locRow.account_name}/${locationName}`;
    }
  }

  try {
    // Legacy: mode=generate uses Gemini from topic text
    if (mode === "generate" && topic) {
      const result = await generateAndPublishPost(email, fullLocationPath, topic, imageUrl);
      return NextResponse.json(result);
    }

    if (!summaryText) {
      return NextResponse.json(
        { error: "Field 'summaryText' is required." },
        { status: 400 }
      );
    }

    const apiResponse = await createGbpPost(
      email,
      fullLocationPath,
      summaryText,
      imageUrl,
      ctaUrl,
      topicType,
      eventData,
      offerData,
      ctaActionType
    );
    return NextResponse.json({ apiResponse });
  } catch (err) {
    console.error("[GBP posts]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
