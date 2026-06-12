/**
 * POST /api/gbp/reviews/generate
 * Generates an AI reply using Gemini but does NOT post it.
 *
 * Body: { email, locationName, reviewerName, reviewText, customInstruction? }
 * Returns: { aiReply }
 */
import { NextResponse } from "next/server";
import { generateReplyOnly } from "@/lib/gbp";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, locationName, reviewerName, reviewText, customInstruction, reviewPhotos, geminiModel, starRating } = body;

  if (!email || !locationName || !reviewerName) {
    return NextResponse.json(
      { error: "Required fields: email, locationName, reviewerName." },
      { status: 400 }
    );
  }

  try {
    const aiReply = await generateReplyOnly(
      email,
      locationName,
      reviewerName,
      reviewText,
      customInstruction,
      Array.isArray(reviewPhotos) ? reviewPhotos : [],
      geminiModel,
      starRating
    );
    return NextResponse.json({ aiReply });
  } catch (err) {
    console.error("[GBP reviews/generate]", err);

    // Extract retryDelay from Gemini 429 error
    if (err.status === 429 || err.message?.includes("429")) {
      const retryViolation = err.errorDetails?.find(
        (d) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
      );
      const delayStr = retryViolation?.retryDelay ?? "";
      const seconds = parseInt(delayStr) || 60;
      return NextResponse.json(
        { error: "Gemini rate limit reached. Please wait before generating more replies.", retryAfterSeconds: seconds },
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
