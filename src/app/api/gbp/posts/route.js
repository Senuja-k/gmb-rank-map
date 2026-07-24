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
 *   scheduledTime?,       // optional ISO/RFC3339 timestamp for scheduled publishing
 *   // Legacy mode support:
 *   mode?,                // "generate" uses Gemini from topic field
 *   topic?,               // used when mode = "generate"
 * }
 */

import { NextResponse } from "next/server";
import { generateAndPublishPost, createGbpPost, fetchPostsForLocation, updateGbpPost, deleteGbpPost } from "@/lib/gbp";
import { createAdminClient } from "@/lib/supabase-server";

function extractGooglePostError(err) {
  const apiError = err.response?.data?.error ?? err.cause ?? err;
  const detailGroups = [
    err.response?.data?.error?.details,
    err.cause?.details,
    apiError?.details,
  ].filter(Array.isArray);

  const fieldViolations = detailGroups.flatMap((details) =>
    details.flatMap((detail) => detail.fieldViolations ?? detail.violations ?? [])
  );
  if (fieldViolations.length) {
    return fieldViolations
      .map((violation) => {
        const field = violation.field ?? violation.subject ?? "field";
        const description = violation.description ?? violation.message ?? JSON.stringify(violation);
        return `${field}: ${description}`;
      })
      .join("; ");
  }

  const errors = [err.response?.data?.error?.errors, err.cause?.errors, apiError?.errors].find(Array.isArray);
  if (errors?.length) {
    return errors
      .map((item) => item.message ?? item.reason ?? JSON.stringify(item))
      .join("; ");
  }

  return apiError?.message ?? err.message ?? "Publish failed.";
}

function normalizeFutureScheduledTime(scheduledTime) {
  if (!scheduledTime) return null;
  const parsedScheduledTime = new Date(scheduledTime);
  if (Number.isNaN(parsedScheduledTime.getTime())) {
    throw new Error("Field 'scheduledTime' must be a valid ISO date-time.");
  }
  if (parsedScheduledTime.getTime() <= Date.now()) {
    throw new Error("Scheduled time must be in the future.");
  }
  return parsedScheduledTime.toISOString();
}

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
    scheduledTime = null,
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

    let normalizedScheduledTime = null;
    try {
      normalizedScheduledTime = normalizeFutureScheduledTime(scheduledTime);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
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
      ctaActionType,
      normalizedScheduledTime
    );
    return NextResponse.json({ apiResponse });
  } catch (err) {
    console.error("[GBP posts]", err);
    return NextResponse.json({ error: extractGooglePostError(err) }, { status: 500 });
  }
}

export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, name, summaryText, scheduledTime, eventTitle } = body;
  if (!email || !name) {
    return NextResponse.json(
      { error: "Required fields: email, name." },
      { status: 400 }
    );
  }

  const updates = {};
  const updateMask = [];

  if (typeof summaryText === "string") {
    const normalizedSummary = summaryText.trim();
    if (!normalizedSummary) {
      return NextResponse.json({ error: "Post content is empty." }, { status: 400 });
    }
    updates.summary = normalizedSummary;
    updateMask.push("summary");
  }

  if (scheduledTime) {
    try {
      updates.scheduledTime = normalizeFutureScheduledTime(scheduledTime);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    updateMask.push("scheduledTime");
  }

  if (typeof eventTitle === "string") {
    const normalizedTitle = eventTitle.trim();
    if (!normalizedTitle) {
      return NextResponse.json({ error: "Post title is empty." }, { status: 400 });
    }
    updates.event = { title: normalizedTitle };
    updateMask.push("event.title");
  }

  if (!updateMask.length) {
    return NextResponse.json({ error: "No editable fields were provided." }, { status: 400 });
  }

  try {
    const apiResponse = await updateGbpPost(email, name, updates, updateMask.join(","));
    return NextResponse.json({ apiResponse });
  } catch (err) {
    console.error("[GBP posts update]", err);
    return NextResponse.json({ error: extractGooglePostError(err) }, { status: 500 });
  }
}

export async function DELETE(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, name } = body;
  if (!email || !name) {
    return NextResponse.json(
      { error: "Required fields: email, name." },
      { status: 400 }
    );
  }

  try {
    const apiResponse = await deleteGbpPost(email, name);
    return NextResponse.json({ apiResponse });
  } catch (err) {
    console.error("[GBP posts delete]", err);
    return NextResponse.json({ error: extractGooglePostError(err) }, { status: 500 });
  }
}
