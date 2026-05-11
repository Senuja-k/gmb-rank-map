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

  const { email, locationName, reviewerName, reviewText, customInstruction } = body;

  if (!email || !locationName || !reviewerName || !reviewText) {
    return NextResponse.json(
      { error: "Required fields: email, locationName, reviewerName, reviewText." },
      { status: 400 }
    );
  }

  try {
    const aiReply = await generateReplyOnly(
      email,
      locationName,
      reviewerName,
      reviewText,
      customInstruction
    );
    return NextResponse.json({ aiReply });
  } catch (err) {
    console.error("[GBP reviews/generate]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
