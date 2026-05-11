/**
 * POST /api/gbp/reviews/post
 * Posts a reply to a review given its full resource name.
 *
 * Body: { email, reviewName, replyText }
 * Returns: { success: true }
 */
import { NextResponse } from "next/server";
import { postReviewReply } from "@/lib/gbp";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, reviewName, replyText } = body;

  if (!email || !reviewName || !replyText) {
    return NextResponse.json(
      { error: "Required fields: email, reviewName, replyText." },
      { status: 400 }
    );
  }

  try {
    await postReviewReply(email, reviewName, replyText);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[GBP reviews/post]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
