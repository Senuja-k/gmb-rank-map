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
import { generateAndPublishPost, createGbpPost } from "@/lib/gbp";

export async function POST(request) {
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

  try {
    // Legacy: mode=generate uses Gemini from topic text
    if (mode === "generate" && topic) {
      const result = await generateAndPublishPost(email, locationName, topic, imageUrl);
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
      locationName,
      summaryText,
      imageUrl,
      ctaUrl,
      topicType,
      eventData,
      offerData
    );
    return NextResponse.json({ apiResponse });
  } catch (err) {
    console.error("[GBP posts]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
