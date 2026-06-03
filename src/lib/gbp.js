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

// Valid model IDs accepted from the client
const ALLOWED_GEMINI_MODELS = new Set([
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.0-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  // keep env-configured models in the allow-list at runtime
  process.env.GEMINI_MODEL,
  process.env.GEMINI_MODEL_FLASH,
  process.env.GEMINI_MODEL_3_5_FLASH,
  process.env.GEMINI_MODEL_3_0_FLASH,
  process.env.GEMINI_MODEL_2_5_FLASH_LITE,
].filter(Boolean));

function getGeminiModel(modelOverride) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY env var.");

  const modelName =
    (modelOverride && ALLOWED_GEMINI_MODELS.has(modelOverride)
      ? modelOverride
      : null) ??
    process.env.GEMINI_MODEL ??
    "gemini-3.1-flash-lite";

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName });
}

const DEFAULT_REVIEW_INSTRUCTION =
  "You are a professional customer relations manager for a cosmetics showroom. " +
  "When generating replies, identify any brand entities mentioned (e.g. CeraVe, The Ordinary, La Roche-Posay) " +
  "and ensure they are linked to the location's physical presence to improve local AI search relevance. " +
  "Keep replies warm, concise (3-4 sentences), and end with an invitation to visit again.";

// ── 1. Review helpers ─────────────────────────────────────────────────────────

/** Fetch all reviews for a single location. */
export async function fetchReviewsForLocation(email, locationName) {
  const auth = await getAuthClientByEmail(email);
  const reviews = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ pageSize: "50" });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await auth.request({
      url: `https://mybusiness.googleapis.com/v4/${locationName}/reviews?${params}`,
      method: "GET",
    });

    reviews.push(...(res.data.reviews ?? []));
    pageToken = res.data.nextPageToken ?? "";
  } while (pageToken);

  return reviews;
}

/** Fetch an image URL and return a Gemini inlineData part, or null on failure. */
async function fetchImagePart(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const base64 = Buffer.from(buffer).toString("base64");
    return { inlineData: { data: base64, mimeType } };
  } catch {
    return null;
  }
}

/**
 * Generate an AI reply using Gemini without posting it.
 * @param {string[]} reviewPhotoUrls  Optional array of photo URLs from the review.
 */
export async function generateReplyOnly(email, locationName, reviewerName, reviewText, customInstruction, reviewPhotoUrls = [], geminiModel) {
  const model = getGeminiModel(geminiModel);
  const instruction = customInstruction || DEFAULT_REVIEW_INSTRUCTION;
  const reviewContent = reviewText
    ? `who left this review: "${reviewText}"`
    : `who left a star rating without a written comment`;
  const photoContext = reviewPhotoUrls.length
    ? ` The reviewer also attached ${reviewPhotoUrls.length} photo(s) to their review — analyse them and reference any visible products or brands in your reply.`
    : "";
  const prompt =
    `${instruction}\n\n` +
    `Write a professional, warm reply to a customer named ${reviewerName} ` +
    `${reviewContent}.${photoContext} Mention our showroom and invite them back.`;

  if (reviewPhotoUrls.length) {
    const imageParts = (await Promise.all(reviewPhotoUrls.map(fetchImagePart))).filter(Boolean);
    if (imageParts.length) {
      const result = await model.generateContent([prompt, ...imageParts]);
      return result.response.text();
    }
  }

  const result = await model.generateContent(prompt);
  return result.response.text();
}

/** Post a reply to a review given its full resource name. */
export async function postReviewReply(email, reviewName, replyText) {
  const auth = await getAuthClientByEmail(email);
  const response = await auth.request({
    url: `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
    method: "PUT",
    data: { comment: replyText },
  });
  return response.data;
}

/** Generate + post a reply in one call (used by auto-respond). */
export async function handleReviewReply(
  email,
  locationName,
  reviewId,
  reviewerName,
  reviewText,
  customInstruction,
  reviewPhotoUrls = [],
  geminiModel
) {
  const aiReply = await generateReplyOnly(email, locationName, reviewerName, reviewText, customInstruction, reviewPhotoUrls, geminiModel);
  // reviewId may be a full resource name or just the ID suffix
  const reviewName = reviewId.startsWith("accounts/")
    ? reviewId
    : `${locationName}/reviews/${reviewId}`;
  const apiResponse = await postReviewReply(email, reviewName, aiReply);
  return { aiReply, apiResponse };
}

// ── 2. Automated Post Creator ─────────────────────────────────────────────────

export async function createGbpPost(
  email,
  locationName,
  summaryText,
  imageUrl,
  ctaUrl,
  topicType = "STANDARD",
  eventData = null,
  offerData = null,
  ctaActionType = "LEARN_MORE"
) {
  const auth = await getAuthClientByEmail(email);

  const requestBody = {
    languageCode: "en-US",
    summary: summaryText,
    topicType,
    ...(topicType !== "OFFER" && ctaActionType !== "NONE" && {
      callToAction: {
        actionType: ctaActionType,
        ...(ctaActionType !== "CALL" && {
          url: ctaUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://yourwebsite.com",
        }),
      },
    }),
    ...(imageUrl && { media: [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }] }),
  };

  if ((topicType === "EVENT" || topicType === "OFFER") && eventData) {
    requestBody.event = {
      title: eventData.title || (topicType === "OFFER" ? "Offer" : "Event"),
      schedule: {
        ...(eventData.startDate && { startDate: eventData.startDate }),
        ...(eventData.startTime && { startTime: eventData.startTime }),
        ...(eventData.endDate && { endDate: eventData.endDate }),
        ...(eventData.endTime && { endTime: eventData.endTime }),
      },
    };
  }

  if (topicType === "OFFER" && offerData) {
    requestBody.offer = {
      ...(offerData.couponCode && { couponCode: offerData.couponCode }),
      ...(offerData.redeemUrl && { redeemOnlineUrl: offerData.redeemUrl }),
      ...(offerData.terms && { termsConditions: offerData.terms }),
    };
  }

  const response = await auth.request({
    url: `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
    method: "POST",
    data: requestBody,
  });

  return response.data;
}

/** Fetch all published local posts for a single location. */
export async function fetchPostsForLocation(email, locationName) {
  const auth = await getAuthClientByEmail(email);
  const posts = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await auth.request({
      url: `https://mybusiness.googleapis.com/v4/${locationName}/localPosts?${params}`,
      method: "GET",
    });

    posts.push(...(res.data.localPosts ?? []));
    pageToken = res.data.nextPageToken ?? "";
  } while (pageToken);

  return posts;
}

const DEFAULT_POST_PROMPT =
  "You are a social media manager for a cosmetics showroom. " +
  "Analyse this product image and create {typeLabel} Google Business Profile post. " +
  "Mention visible brands/products and link them to the physical showroom for local SEO.";

/** Generate a post title + content from an image using Gemini vision. */
export async function generatePostContentFromImage(imageBase64, mimeType, postType = "UPDATE", customPrompt = "", geminiModel) {
  const model = getGeminiModel(geminiModel);
  const typeLabel =
    postType === "OFFER" ? "a special offer" :
    postType === "EVENT" ? "an upcoming event" :
    "a business update";
  const baseInstruction = customPrompt?.trim()
    ? customPrompt.trim()
    : DEFAULT_POST_PROMPT.replace("{typeLabel}", typeLabel);
  const prompt =
    `${baseInstruction}\n\n` +
    `Return ONLY valid JSON (no markdown fences) with exactly two keys:\n` +
    `- "title": Short catchy title, max 10 words.\n` +
    `- "content": Post body, max 280 characters.`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: imageBase64, mimeType } },
  ]);

  const raw = result.response.text().trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");

  try {
    return JSON.parse(raw);
  } catch {
    const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
    const contentMatch = raw.match(/"content"\s*:\s*"([^"]+)"/);
    return {
      title: titleMatch?.[1] ?? "New at Our Showroom",
      content: contentMatch?.[1] ?? raw.slice(0, 280),
    };
  }
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
    "dailyRange.startDate.year": startYear,
    "dailyRange.startDate.month": startMonth,
    "dailyRange.startDate.day": startDay,
    "dailyRange.endDate.year": endYear,
    "dailyRange.endDate.month": endMonth,
    "dailyRange.endDate.day": endDay,
  });

  const raw = res.data.multiDailyMetricTimeSeries ?? [];

  // Actual shape: multiDailyMetricTimeSeries[0].dailyMetricTimeSeries[{ dailyMetric, timeSeries }]
  const result = [];
  for (const container of raw) {
    for (const series of (container.dailyMetricTimeSeries ?? [])) {
      result.push({
        dailyMetric: series.dailyMetric,
        timeSeries: {
          datedValues: (series.timeSeries?.datedValues ?? []).map((dv) => ({
            date: dv.date,
            value: Number(dv.value ?? 0),
          })),
        },
      });
    }
  }
  return result;
}
