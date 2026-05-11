/**
 * POST /api/gbp/reviews/reply
 *
 * Body (JSON):
 * {
 *   "accountId":    "123456789",
 *   "locationName": "accounts/123456789/locations/987654321",
 *   "reviewId":     "accounts/123456789/locations/987654321/reviews/AbCdEf",
 *   "reviewerName": "Jane Doe",
 *   "reviewText":   "Great selection of skincare!"
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

  const { email, locationName, reviewId, reviewerName, reviewText, customInstruction } = body;

  if (!email || !locationName || !reviewId || !reviewerName || !reviewText) {
    return NextResponse.json(
      {
        error:
          "Required fields: email, locationName, reviewId, reviewerName, reviewText.",
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
      reviewText,
      customInstruction
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[GBP reviews/reply]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
