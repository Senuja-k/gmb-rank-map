import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const SYSTEM_INSTRUCTION = `You are a read-only AI assistant for GBP Manager.
You help users understand Google Business Profile rankings, reviews, posts, and performance metrics.
Do not claim you can publish, reply, delete, edit, connect accounts, or modify data.
If the user asks you to change data, explain that you can only provide guidance.`;

const ALLOWED_MODELS = [
  process.env.GEMINI_MODEL,
  process.env.GEMINI_MODEL_2_5_FLASH_LITE,
  "gemini-3.1-flash-lite",
  process.env.GEMINI_MODEL_3_5_FLASH,
  process.env.GEMINI_MODEL_FLASH,
  "gemini-3.5-flash",
  "gemini-2.5-flash",
].filter(Boolean);

function toGeminiRole(role) {
  return role === "assistant" ? "model" : "user";
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .slice(-12)
    .map((message) => ({
      role: toGeminiRole(message?.role),
      parts: [{ text: String(message?.text ?? "").slice(0, 4000) }],
    }))
    .filter((message) => message.parts[0].text.trim());
}

export async function POST(req) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY env var." }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const contents = normalizeMessages(body.messages);
    if (!contents.length) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    let lastError;

    for (const modelName of ALLOWED_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_INSTRUCTION,
        });
        const result = await model.generateContent({ contents });
        const reply = result.response.text();
        return NextResponse.json({ reply, model: modelName });
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError ?? new Error("No Gemini model configured.");
  } catch (err) {
    console.error("[assistant/chat]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Assistant request failed." },
      { status: 500 }
    );
  }
}
