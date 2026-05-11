/**
 * Google Business Profile – core functions
 *
 * All functions accept `email` (the connected Google account email) instead of
 * an opaque accountId. The email is used to look up OAuth tokens in Supabase.
 */

import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthClientByEmail } from "./gbp-auth";

// ── Gemini setup ─────────────────────────────────────────────────────────────

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var.");

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
}

// ── 1. Review Auto-Responder ──────────────────────────────────────────────────

export async function handleReviewReply(
  email,
  locationName,
  reviewId,
  reviewerName,
  reviewText
) {
  const model = getGeminiModel();

  const systemInstruction =
    "You are a professional customer relations manager for a cosmetics showroom. " +
    "When generating replies, identify any brand entities mentioned (e.g. CeraVe, The Ordinary, La Roche-Posay) " +
    "and ensure they are linked to the location's physical presence to improve local AI search relevance. " +
    "Keep replies warm, concise (3-4 sentences), and end with an invitation to visit again.";

  const prompt =
    `${systemInstruction}\n\n` +
    `Write a professional, warm reply to a customer named ${reviewerName} who left this review: ` +
    `"${reviewText}". Mention our showroom and invite them back.`;

  const result = await model.generateContent(prompt);
  const aiReply = result.response.text();

  const auth = await getAuthClientByEmail(email);
  const mybusiness = google.mybusinessreviews({ version: "v1", auth });

  const response = await mybusiness.accounts.locations.reviews.updateReply({
    name: `${locationName}/reviews/${reviewId}`,
    requestBody: { comment: aiReply },
  });

  return { aiReply, apiResponse: response.data };
}

// ── 2. Automated Post Creator ─────────────────────────────────────────────────

export async function createGbpPost(
  email,
  locationName,
  summaryText,
  imageUrl,
  ctaUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yourwebsite.com"
) {
  const auth = await getAuthClientByEmail(email);
  const postsClient = google.mybusinesses({ version: "v4", auth });

  const response = await postsClient.accounts.locations.localPosts.create({
    parent: locationName,
    requestBody: {
      languageCode: "en-US",
      summary: summaryText,
      callToAction: { actionType: "LEARN_MORE", url: ctaUrl },
      ...(imageUrl && {
        media: [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }],
      }),
    },
  });

  return response.data;
}

export async function generateAndPublishPost(
  email,
  locationName,
  topic,
  imageUrl = ""
) {
  const model = getGeminiModel();

  const systemInstruction =
    "You are a social media manager for a cosmetics showroom. " +
    "When generating post descriptions, identify the brand entities mentioned (e.g. CeraVe, The Ordinary) " +
    "and ensure they are linked to the location's physical presence to improve local AI search relevance. " +
    "Write in an engaging, friendly tone. Keep it under 300 characters for Google Posts.";

  const prompt = `${systemInstruction}\n\nWrite a Google Business Profile post about: ${topic}`;

  const result = await model.generateContent(prompt);
  const postText = result.response.text();

  const apiResponse = await createGbpPost(email, locationName, postText, imageUrl);

  return { postText, apiResponse };
}

// ── 3. Performance Data Fetcher ───────────────────────────────────────────────

export async function getShowroomStats(email, locationName, dateRange = {}) {
  const {
    startYear = 2026,
    startMonth = 1,
    startDay = 1,
    endYear = 2026,
    endMonth = 5,
    endDay = 1,
  } = dateRange;

  const auth = await getAuthClientByEmail(email);
  const performance = google.businessprofileperformance({ version: "v1", auth });

  const res = await performance.locations.fetchMultiDailyMetricsTimeSeries({
    location: locationName,
    dailyMetrics: [
      "WEBSITE_CLICKS",
      "CALL_CLICKS",
      "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
      "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
      "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
      "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
      "BUSINESS_DIRECTION_REQUESTS",
    ],
    "dailyRange.start_date.year": startYear,
    "dailyRange.start_date.month": startMonth,
    "dailyRange.start_date.day": startDay,
    "dailyRange.end_date.year": endYear,
    "dailyRange.end_date.month": endMonth,
    "dailyRange.end_date.day": endDay,
  });

  return res.data.multiDailyMetricTimeSeries ?? [];
}
