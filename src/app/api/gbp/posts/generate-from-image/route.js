import { NextResponse } from "next/server";
import { generatePostContentFromImage } from "@/lib/gbp";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { imageBase64, mimeType, postType = "UPDATE", customPrompt = "", geminiModel } = body;

  if (!imageBase64 || !mimeType) {
    return NextResponse.json(
      { error: "imageBase64 and mimeType are required." },
      { status: 400 }
    );
  }

  try {
    const result = await generatePostContentFromImage(imageBase64, mimeType, postType, customPrompt, geminiModel);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[generate-from-image]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
