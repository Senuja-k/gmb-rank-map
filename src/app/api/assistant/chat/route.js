import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { fetchReviewsForLocation, getShowroomStats } from "@/lib/gbp";
import { listReviewReports } from "@/lib/review-reports";
import {
  canAffordGeminiSearchGrounding,
  getGeminiSearchGroundingStatus,
  recordGeminiSearchGrounding,
} from "@/lib/budget";
import { clearAuthCookies, createAdminClient, requireCurrentProfile } from "@/lib/supabase-server";

const SYSTEM_INSTRUCTION = `You are a read-only AI assistant for GBP Manager.
You help users understand Google Business Profile rankings, reviews, posts, and performance metrics.
Do not claim you can publish, reply, delete, edit, connect accounts, or modify data.
If the user asks you to change data, explain that you can only provide guidance.
When using provided business data, state the date range used.
When using web search, mention that the information is from web search and may need source verification.`;

const MAX_CONTEXT_CHARS = 500000;

const ALLOWED_MODELS = [
  process.env.GEMINI_MODEL,
  process.env.GEMINI_MODEL_2_5_FLASH_LITE,
  "gemini-3.1-flash-lite",
  process.env.GEMINI_MODEL_3_5_FLASH,
  process.env.GEMINI_MODEL_FLASH,
  "gemini-3.5-flash",
  "gemini-2.5-flash",
].filter(Boolean);

const SEARCH_MODELS = [
  process.env.GEMINI_MODEL_3_5_FLASH,
  process.env.GEMINI_MODEL,
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
].filter(Boolean);

function uniqueModels(models) {
  return [...new Set(models)];
}

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

function latestUserText(contents) {
  const latest = [...contents].reverse().find((message) => message.role === "user");
  return latest?.parts?.[0]?.text ?? "";
}

function wantsReviewData(text) {
  return /\b(review|reviews|rating|ratings|reply|replied|unresponded|unanswered|customer feedback|sentiment)\b/i.test(text);
}

function wantsPerformanceData(text) {
  return /\b(performance|clicks?|calls?|impressions?|views?|directions?|traffic|metric|metrics|analytics|compare|period|ytd|month|week|quarter|year)\b/i.test(text);
}

function wantsWebSearch(text) {
  return /\b(web|internet|search|google search|latest|today|current|news|competitor|competitors|market|trend|trends)\b/i.test(text);
}

function fullLocationName(location) {
  return location.location_name.startsWith("accounts/")
    ? location.location_name
    : `${location.account_name}/${location.location_name}`;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateParts(date) {
  return {
    startYear: date.getUTCFullYear(),
    startMonth: date.getUTCMonth() + 1,
    startDay: date.getUTCDate(),
  };
}

function rangeParts(start, end) {
  return {
    ...dateParts(start),
    endYear: end.getUTCFullYear(),
    endMonth: end.getUTCMonth() + 1,
    endDay: end.getUTCDate(),
  };
}

const MONTH_NAMES = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function monthRange(monthIndex, year) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return { start, end };
}

function extractMentionedMonthRanges(text) {
  const ranges = [];
  const seen = new Set();
  const monthPattern = new RegExp(
    `\\b(${Object.keys(MONTH_NAMES).join("|")})\\b(?:\\s+(20\\d{2}))?`,
    "gi"
  );
  const explicitYears = [...text.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const fallbackYear = explicitYears.at(-1) ?? new Date().getUTCFullYear();
  let match;

  while ((match = monthPattern.exec(text))) {
    const monthName = match[1].toLowerCase();
    const year = Number(match[2] ?? fallbackYear);
    const key = `${monthName}_${year}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { start, end } = monthRange(MONTH_NAMES[monthName], year);
    ranges.push({
      key,
      label: `${monthName[0].toUpperCase()}${monthName.slice(1)} ${year}`,
      start,
      end,
    });
  }

  return ranges;
}

function buildPerformanceRanges(text = "") {
  const end = new Date();
  const startOfYear = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  const daysAgo = (days) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - days);
    return date;
  };
  const monthsAgo = (months) => {
    const date = new Date(end);
    date.setUTCMonth(date.getUTCMonth() - months);
    return date;
  };

  const ranges = [
    ...extractMentionedMonthRanges(text),
    { key: "last_7_days", label: "Last 7 days", start: daysAgo(7), end },
    { key: "last_30_days", label: "Last 30 days", start: daysAgo(30), end },
    { key: "last_90_days", label: "Last 90 days", start: daysAgo(90), end },
    { key: "year_to_date", label: "Year to date", start: startOfYear, end },
    { key: "last_12_months", label: "Last 12 months", start: monthsAgo(12), end },
  ];

  return ranges;
}

function summarizeReviews(reviews) {
  const starCounts = { ONE: 0, TWO: 0, THREE: 0, FOUR: 0, FIVE: 0, unknown: 0 };
  let replied = 0;
  let totalStars = 0;
  let ratedCount = 0;

  for (const review of reviews) {
    if (review.reviewReply) replied += 1;
    const rating = review.starRating ?? "unknown";
    starCounts[rating] = (starCounts[rating] ?? 0) + 1;
    const numeric = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[rating];
    if (numeric) {
      totalStars += numeric;
      ratedCount += 1;
    }
  }

  return {
    total: reviews.length,
    replied,
    unresponded: reviews.length - replied,
    averageRating: ratedCount ? Number((totalStars / ratedCount).toFixed(2)) : null,
    starCounts,
  };
}

function reviewSample(review) {
  return {
    reviewer: review.reviewer?.displayName ?? "Anonymous",
    rating: review.starRating ?? null,
    createdAt: review.createTime ?? null,
    replied: Boolean(review.reviewReply),
    comment: String(review.comment ?? "").slice(0, 600),
    reply: review.reviewReply?.comment ? String(review.reviewReply.comment).slice(0, 400) : null,
  };
}

function compactReviewRecord(review) {
  return {
    id: review.name ?? null,
    reviewer: review.reviewer?.displayName ?? "Anonymous",
    rating: review.starRating ?? null,
    createdAt: review.createTime ?? null,
    updatedAt: review.updateTime ?? null,
    replied: Boolean(review.reviewReply),
    comment: String(review.comment ?? "").slice(0, 1000),
    reply: review.reviewReply?.comment ? String(review.reviewReply.comment).slice(0, 500) : null,
  };
}

function sumPerformanceSeries(rows) {
  const totals = {};
  for (const row of rows ?? []) {
    totals[row.dailyMetric] = (row.timeSeries?.datedValues ?? []).reduce(
      (sum, point) => sum + Number(point.value ?? 0),
      0
    );
  }
  return totals;
}

function compactPerformanceSeries(rows) {
  const seriesByMetric = {};
  for (const row of rows ?? []) {
    seriesByMetric[row.dailyMetric] = (row.timeSeries?.datedValues ?? []).map((point) => ({
      date: point.date,
      value: Number(point.value ?? 0),
    }));
  }
  return seriesByMetric;
}

async function listEnabledLocations() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gbp_locations")
    .select("location_name, account_name, display_name, address, google_email, is_enabled")
    .eq("is_enabled", true)
    .order("display_name");

  if (error) throw new Error(`listEnabledLocations: ${error.message}`);
  return data ?? [];
}

async function buildReviewContext(locations) {
  const locationResults = [];
  const errors = [];

  for (const location of locations) {
    try {
      const reviews = await fetchReviewsForLocation(location.google_email, fullLocationName(location), { onlyUnreplied: false });
      const newest = [...reviews]
        .sort((a, b) => new Date(b.createTime ?? 0) - new Date(a.createTime ?? 0))
        .slice(0, 12)
        .map(reviewSample);
      const lowRating = reviews
        .filter((review) => ["ONE", "TWO", "THREE"].includes(review.starRating))
        .sort((a, b) => new Date(b.createTime ?? 0) - new Date(a.createTime ?? 0))
        .slice(0, 8)
        .map(reviewSample);

      locationResults.push({
        location: location.display_name,
        address: location.address,
        summary: summarizeReviews(reviews),
        newestReviews: newest,
        recentLowRatingReviews: lowRating,
        reviewRecords: [...reviews]
          .sort((a, b) => new Date(b.createTime ?? 0) - new Date(a.createTime ?? 0))
          .map(compactReviewRecord),
      });
    } catch (err) {
      errors.push({ location: location.display_name, error: err.message });
    }
  }

  let savedReports = [];
  try {
    savedReports = (await listReviewReports()).slice(0, 20);
  } catch (err) {
    errors.push({ location: "saved review reports", error: err.message });
  }

  return {
    note: "Review access is read-only. Summaries include all fetched reviews; samples are truncated to keep prompts usable.",
    savedReports,
    locations: locationResults,
    errors,
  };
}

async function buildPerformanceContext(locations, text) {
  const ranges = buildPerformanceRanges(text);
  const results = [];
  const errors = [];

  for (const location of locations) {
    const rangeTotals = {};
    for (const range of ranges) {
      try {
        const rows = await getShowroomStats(
          location.google_email,
          location.location_name,
          rangeParts(range.start, range.end)
        );
        rangeTotals[range.key] = {
          label: range.label,
          startDate: isoDate(range.start),
          endDate: isoDate(range.end),
          totals: sumPerformanceSeries(rows),
          series: compactPerformanceSeries(rows),
        };
      } catch (err) {
        errors.push({ location: location.display_name, range: range.key, error: err.message });
      }
    }

    results.push({
      location: location.display_name,
      address: location.address,
      ranges: rangeTotals,
    });
  }

  return {
    note: "Performance access is read-only. Explicitly requested months are included when detected, plus common time windows for comparison.",
    metricMeaning: {
      WEBSITE_CLICKS: "Website clicks",
      CALL_CLICKS: "Call clicks",
      BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "Desktop Maps impressions",
      BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "Desktop Search impressions",
      BUSINESS_IMPRESSIONS_MOBILE_MAPS: "Mobile Maps impressions",
      BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "Mobile Search impressions",
      BUSINESS_DIRECTION_REQUESTS: "Direction requests",
    },
    locations: results,
    errors,
  };
}

async function buildBusinessContext(text) {
  const includeReviews = wantsReviewData(text);
  const includePerformance = wantsPerformanceData(text);
  if (!includeReviews && !includePerformance) return null;

  const locations = await listEnabledLocations();
  const context = {
    generatedAt: new Date().toISOString(),
    locations: locations.map((location) => ({
      location: location.display_name,
      address: location.address,
      locationName: location.location_name,
      email: location.google_email,
    })),
  };

  if (includeReviews) context.reviews = await buildReviewContext(locations);
  if (includePerformance) context.performance = await buildPerformanceContext(locations, text);
  return context;
}

function appendContext(contents, businessContext) {
  if (!businessContext) return contents;
  return [
    {
      role: "user",
      parts: [
        {
          text:
            "READ-ONLY GBP BUSINESS DATA CONTEXT. Use this data to answer the user's question. Do not claim you can modify it.\n" +
            JSON.stringify(businessContext).slice(0, MAX_CONTEXT_CHARS),
        },
      ],
    },
    ...contents,
  ];
}

function modelConfig(modelName) {
  return {
    model: modelName,
    systemInstruction: SYSTEM_INSTRUCTION,
  };
}

function contentsToInteractionInput(contents) {
  const conversation = contents
    .map((message) => {
      const label = message.role === "model" ? "Assistant" : "User";
      return `${label}: ${message.parts?.map((part) => part.text ?? "").join("\n") ?? ""}`;
    })
    .join("\n\n");

  return `${SYSTEM_INSTRUCTION}\n\n${conversation}`;
}

function extractInteractionOutput(data) {
  const directText = data.outputText ?? data.output_text;
  if (directText) return { text: directText, citations: [] };

  const textParts = [];
  const citations = [];
  for (const step of data.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type !== "text" || !block.text) continue;
      textParts.push(block.text);
      for (const annotation of block.annotations ?? []) {
        if (annotation.type === "url_citation" && annotation.url) {
          citations.push({
            title: annotation.title ?? annotation.url,
            url: annotation.url,
          });
        }
      }
    }
  }

  return { text: textParts.join("\n\n"), citations };
}

function appendCitations(reply, citations) {
  const unique = [];
  const seen = new Set();
  for (const citation of citations) {
    if (seen.has(citation.url)) continue;
    seen.add(citation.url);
    unique.push(citation);
  }

  if (!unique.length) return reply;
  return `${reply}\n\nSources:\n${unique.map((citation) => `- [${citation.title}](${citation.url})`).join("\n")}`;
}

async function generateWithGoogleSearch(apiKey, modelName, contents) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model: modelName,
      input: contentsToInteractionInput(contents),
      tools: [{ type: "google_search" }],
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data.error?.message ?? `Google Search grounding failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  const { text, citations } = extractInteractionOutput(data);
  if (!text) throw new Error("Google Search grounding returned no text.");
  return {
    reply: appendCitations(text, citations),
    citations,
  };
}

export async function POST(req) {
  try {
    await requireCurrentProfile();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY env var." }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const contents = normalizeMessages(body.messages);
    if (!contents.length) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const userText = latestUserText(contents);
    const useWebSearch = wantsWebSearch(userText);
    const businessContext = await buildBusinessContext(userText);
    const promptContents = appendContext(contents, businessContext);
    const genAI = new GoogleGenerativeAI(apiKey);
    let lastError;

    if (useWebSearch) {
      for (const modelName of uniqueModels(SEARCH_MODELS)) {
        try {
          const budgetCheck = await canAffordGeminiSearchGrounding(1);
          if (!budgetCheck.allowed) {
            return NextResponse.json(
              {
                error: `Monthly Gemini Search grounding free limit reached (${budgetCheck.remaining} of ${budgetCheck.limit} prompts remaining). Resets next month.`,
                searchBudget: budgetCheck.status,
              },
              { status: 429 }
            );
          }
          const searchBudget = await recordGeminiSearchGrounding(1);
          const result = await generateWithGoogleSearch(apiKey, modelName, promptContents);
          return NextResponse.json({
            reply: result.reply,
            model: modelName,
            usedBusinessData: Boolean(businessContext),
            usedWebSearch: true,
            searchBudget,
            citations: result.citations,
          });
        } catch (err) {
          lastError = err;
        }
      }
    }

    for (const modelName of uniqueModels(ALLOWED_MODELS)) {
      try {
        const model = genAI.getGenerativeModel(modelConfig(modelName));
        const result = await model.generateContent({ contents: promptContents });
        const reply = result.response.text();
        return NextResponse.json({
          reply: useWebSearch
            ? `${reply}\n\nNote: Web search was requested, but Google Search grounding was unavailable for this request, so I answered using app data/model knowledge only.`
            : reply,
          model: modelName,
          usedBusinessData: Boolean(businessContext),
          usedWebSearch: false,
          searchBudget: useWebSearch ? await getGeminiSearchGroundingStatus() : undefined,
        });
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError ?? new Error("No Gemini model configured.");
  } catch (err) {
    console.error("[assistant/chat]", err);
    const response = NextResponse.json(
      { error: err instanceof Error ? err.message : "Assistant request failed." },
      { status: err.status ?? 500 }
    );
    if (err.status === 401) clearAuthCookies(response);
    return response;
  }
}
