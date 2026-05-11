/**
 * POST /api/gbp/posts
 *
 * Two modes, selected by the "mode" field:
 *
 * mode = "generate"  →  Gemini writes + publishes the post
 * Body: { accountId, locationName, topic, imageUrl? }
 *
 * mode = "manual"    →  Publish pre-written text
 * Body: { accountId, locationName, summaryText, imageUrl?, ctaUrl? }
 *
 * Returns: { postText?, apiResponse }
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

  const { mode = "generate", email, locationName } = body;

  if (!email || !locationName) {
    return NextResponse.json(
      { error: "Required fields: email, locationName." },
      { status: 400 }
    );
  }

  try {
    if (mode === "generate") {
      const { topic, imageUrl = "" } = body;
      if (!topic) {
        return NextResponse.json(
          { error: "Field 'topic' is required for mode=generate." },
          { status: 400 }
        );
      }
      const result = await generateAndPublishPost(
        email,
        locationName,
        topic,
        imageUrl
      );
      return NextResponse.json(result);
    }

    if (mode === "manual") {
      const { summaryText, imageUrl = "", ctaUrl } = body;
      if (!summaryText) {
        return NextResponse.json(
          { error: "Field 'summaryText' is required for mode=manual." },
          { status: 400 }
        );
      }
      const apiResponse = await createGbpPost(
        email,
        locationName,
        summaryText,
        imageUrl,
        ctaUrl
      );
      return NextResponse.json({ apiResponse });
    }

    return NextResponse.json(
      { error: "Invalid mode. Use 'generate' or 'manual'." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[GBP posts]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
