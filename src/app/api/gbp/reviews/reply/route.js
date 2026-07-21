/**
 * POST /api/gbp/reviews/reply
 *
 * Body (JSON):
 * {
 *   "accountId":    "123456789",
 *   "locationName": "accounts/123456789/locations/987654321",
 *   "reviewId":     "accounts/123456789/locations/987654321/reviews/AbCdEf",
 *   "reviewerName": "Jane Doe",
 *   "reviewText":   "Great selection of skincare!" // may be blank for rating-only reviews
 * }
 *
 * Returns:
 * { "aiReply": "...", "apiResponse": { ... } }
 */

import { NextResponse } from "next/server";
import { handleReviewReply } from "@/lib/gbp";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, locationName, reviewId, reviewerName, reviewText, customInstruction, reviewPhotos, geminiModel, starRating } = body;
  const safeReviewText = typeof reviewText === "string" ? reviewText : "";

  if (!email || !locationName || !reviewId || !reviewerName || starRating === undefined || starRating === null) {
    return NextResponse.json(
      {
        error:
          "Required fields: email, locationName, reviewId, reviewerName, starRating.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await handleReviewReply(
      email,
      locationName,
      reviewId,
      reviewerName,
      safeReviewText,
      customInstruction,
      Array.isArray(reviewPhotos) ? reviewPhotos : [],
      geminiModel,
      starRating
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[GBP reviews/reply]", err);

    if (err.status === 429 || err.message?.includes("429")) {
      return NextResponse.json(
        { error: "Gemini rate limit reached. Please wait before generating more replies." },
        { status: 429 }
      );
    }

    if (err.status === 503 || err.message?.includes("503") || err.message?.includes("Service Unavailable")) {
      return NextResponse.json(
        { error: "Gemini is temporarily unavailable due to high demand. Please try again in a moment." },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
