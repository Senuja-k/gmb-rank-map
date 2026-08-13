import { NextResponse } from "next/server";
import { canAffordScan, recordSpend, getBudgetStatus, API_KEY_COUNT } from "@/lib/budget";
import {
  generateId,
  saveScan,
  buildCompetitorSummaries,
} from "@/lib/storage";

// Helpers

const KM_PER_DEG_LAT = 111.32;
const FIELD_MASK = "places.id,places.displayName,places.location";
const REQUEST_DELAY_MS = 350;

function kmPerDegLng(lat) {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}

function generateGrid(center, gridSize, spacingKm) {
  const points = [];
  const half = Math.floor(gridSize / 2);

  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      const lat = center.lat + (row * spacingKm) / KM_PER_DEG_LAT;
      const lng = center.lng + (col * spacingKm) / kmPerDegLng(center.lat);
      points.push({
        lat: parseFloat(lat.toFixed(6)),
        lng: parseFloat(lng.toFixed(6)),
      });
    }
  }
  return points;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateGridPoint(point) {
  return (
    point &&
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 && point.lat <= 90 &&
    point.lng >= -180 && point.lng <= 180
  );
}

function errorTypeForStatus(status) {
  if (status === 429) return "rate_limited";
  if (status === 503) return "service_unavailable";
  if (status === 403) return "forbidden";
  if (status === 400) return "bad_request";
  if (status >= 500) return "server_error";
  return "api_error";
}

function errorSourceForStatus(status) {
  if (status === 429) return "google_rate_limit";
  if (status >= 500) return "google_server_error";
  return "client_config_error";
}

async function fetchOnce(url, options) {
  try {
    return { response: await fetch(url, options), attempts: 1, fetchError: null };
  } catch (err) {
    return { response: null, attempts: 1, fetchError: err };
  }
}
async function readGoogleError(res) {
  try {
    return await res.json();
  } catch {
    try {
      return { message: await res.text() };
    } catch {
      return { message: "Unable to read Google error body." };
    }
  }
}

function emptyPointResult(point, status, extra = {}) {
  return {
    lat: point.lat,
    lng: point.lng,
    rank: null,
    status,
    competitors: [],
    ...extra,
  };
}

function normalizeBusinessName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function targetNameCandidates(value) {
  const raw = String(value || "");
  return [raw, raw.split(" - ")[0], raw.split(" | ")[0]]
    .map(normalizeBusinessName)
    .filter((name) => name.length >= 5);
}

function placeMatchesTarget(place, targetPlaceId, targetBusinessName) {
  const placeId = (place.id ?? "").replace("places/", "");
  if (placeId && placeId === targetPlaceId) return { matched: true, matchedBy: "place_id" };

  const placeName = normalizeBusinessName(place.displayName?.text);
  if (!placeName) return { matched: false, matchedBy: null };

  const nameMatch = targetNameCandidates(targetBusinessName).some(
    (candidate) => placeName === candidate || placeName.includes(candidate) || candidate.includes(placeName)
  );

  return { matched: nameMatch, matchedBy: nameMatch ? "name" : null };
}
function buildSearchRequest(point, keyword, apiKey) {
  const hasKeyword = keyword.trim().length > 0;
  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": FIELD_MASK,
  };

  if (hasKeyword) {
    return {
      requestKind: "Text Search",
      url: "https://places.googleapis.com/v1/places:searchText",
      options: {
        method: "POST",
        headers,
        body: JSON.stringify({
          textQuery: keyword,
          maxResultCount: 20,
          locationBias: {
            circle: {
              center: { latitude: point.lat, longitude: point.lng },
              radius: 1000.0,
            },
          },
        }),
      },
    };
  }

  return {
    requestKind: "Nearby Search",
    url: "https://places.googleapis.com/v1/places:searchNearby",
    options: {
      method: "POST",
      headers,
      body: JSON.stringify({
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: point.lat, longitude: point.lng },
            radius: 1000.0,
          },
        },
      }),
    },
  };
}

// Rank a single grid point and capture competitors
async function rankAtPoint(point, keyword, targetPlaceId, targetBusinessName, apiKey) {
  if (!validateGridPoint(point)) {
    return emptyPointResult(point ?? { lat: null, lng: null }, "client_validation_error", {
      errorType: "invalid_coordinates",
      errorSource: "local_validation",
      googleError: { message: "Invalid coordinates; Google was not called." },
      apiAttempts: 0,
    });
  }

  const { requestKind, url, options } = buildSearchRequest(point, keyword, apiKey);
  const { response: res, attempts: apiAttempts, fetchError } = await fetchOnce(url, options);

  if (!res?.ok) {
    const googleError = res ? await readGoogleError(res) : { message: fetchError?.message || "No response returned by fetch." };
    const httpStatus = res?.status ?? null;
    const errorType = httpStatus ? errorTypeForStatus(httpStatus) : "network_error";
    const errorSource = httpStatus ? errorSourceForStatus(httpStatus) : "network_error";
    console.error(`${requestKind} failed at (${point.lat}, ${point.lng}): ${httpStatus ?? "network_error"}`, googleError);
    return emptyPointResult(point, "api_error", {
      errorType,
      httpStatus,
      errorSource,
      googleError,
      apiAttempts,
    });
  }

  const data = await res.json();
  const places = data.places ?? [];

  if (places.length === 0) {
    return emptyPointResult(point, "zero_results", { apiAttempts });
  }

  let matchedBy = null;
  const competitors = places.map((p, idx) => {
    const targetMatch = placeMatchesTarget(p, targetPlaceId, targetBusinessName);
    if (targetMatch.matched && !matchedBy) matchedBy = targetMatch.matchedBy;
    return {
      placeId: (p.id ?? "").replace("places/", ""),
      name: p.displayName?.text ?? "Unknown",
      rank: idx + 1,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      isTarget: targetMatch.matched,
      matchedBy: targetMatch.matchedBy,
    };
  });

  const idx = competitors.findIndex((comp) => comp.isTarget);

  return {
    lat: point.lat,
    lng: point.lng,
    rank: idx === -1 ? 21 : idx + 1,
    status: "ok",
    competitors,
    apiAttempts,
    matchedBy,
  };
}
// POST handler

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { targetPlaceId, businessName, keyword, center, gridSize, spacingKm, customGrid, force, apiKeyIndex: rawKeyIndex } = body;
  const scanKeyword = typeof keyword === "string" ? keyword : "";

  // Resolve the API key for this request
  const apiKeyIndex = Number.isInteger(rawKeyIndex) && rawKeyIndex >= 0 && rawKeyIndex < API_KEY_COUNT
    ? rawKeyIndex
    : 0;
  const API_KEY_ENV_NAMES = [
    "GOOGLE_MAPS_API_KEY",
    "GOOGLE_MAPS_API_KEY_2",
  ];
  const apiKey = process.env[API_KEY_ENV_NAMES[apiKeyIndex]];
  if (!apiKey) {
    return NextResponse.json(
      { error: `API key ${apiKeyIndex + 1} (${API_KEY_ENV_NAMES[apiKeyIndex]}) is not configured on the server.` },
      { status: 500 }
    );
  }

  if (!targetPlaceId || !center || !gridSize) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (!validateGridPoint(center)) {
    return NextResponse.json({ error: "Invalid scan center coordinates." }, { status: 400 });
  }

  const numericGridSize = Number(gridSize);
  const numericSpacing = spacingKm === undefined || spacingKm === null || spacingKm === "" ? 1 : Number(spacingKm);
  if (!Number.isFinite(numericGridSize) || numericGridSize <= 0 || !Number.isFinite(numericSpacing) || numericSpacing <= 0) {
    return NextResponse.json({ error: "Invalid grid size or spacing." }, { status: 400 });
  }

  const size = Math.min(Math.max(numericGridSize, 3), 13);
  const spacing = numericSpacing;
  const usesTextSearch = scanKeyword.trim().length > 0;
  // Use custom grid points from drawn shape if provided, otherwise generate standard grid
  const grid = (Array.isArray(customGrid) && customGrid.length > 0)
    ? customGrid.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    : generateGrid(center, size, spacing);

  const invalidPointIndex = grid.findIndex((point) => !validateGridPoint(point));
  if (invalidPointIndex !== -1) {
    return NextResponse.json({ error: `Invalid coordinates for grid point ${invalidPointIndex + 1}.` }, { status: 400 });
  }

  const pointCount = grid.length;

  // Budget gate
  const budgetCheck = await canAffordScan(pointCount, usesTextSearch, apiKeyIndex);
  if (!budgetCheck.allowed && !force) {
    const status = await getBudgetStatus(apiKeyIndex);
    const apiName = usesTextSearch ? "Text Search" : "Nearby Search";
    return NextResponse.json(
      {
        error: `Monthly free limit reached for ${apiName} on Key ${apiKeyIndex + 1} (${budgetCheck.remaining} of ${budgetCheck.limit} free calls remaining). Resets next month.`,
        budget: status,
      },
      { status: 429 }
    );
  }

  const results = [];

  for (let i = 0; i < grid.length; i++) {
    const result = await rankAtPoint(grid[i], scanKeyword, targetPlaceId, businessName, apiKey);
    results.push(result);

    if (i + 1 < grid.length) await sleep(REQUEST_DELAY_MS);
  }

  // Record spend
  const apiSpendCount = results.reduce((sum, result) => sum + (result.apiAttempts || 0), 0);
  await recordSpend(apiSpendCount, usesTextSearch, apiKeyIndex);
  const budgetStatus = await getBudgetStatus(apiKeyIndex);

  // Build competitor summaries and stats
  const validResults = results.filter((r) => r.status === "ok" && typeof r.rank === "number");
  const competitors = buildCompetitorSummaries(validResults, targetPlaceId);
  const avgRank = validResults.length
    ? validResults.reduce((s, r) => s + r.rank, 0) / validResults.length
    : null;
  const top3Count = validResults.filter((r) => r.rank <= 3).length;
  const top3Pct = validResults.length ? (top3Count / validResults.length) * 100 : 0;

  // Save scan
  const scanId = generateId();
  const savedScan = {
    id: scanId,
    businessName: businessName || "Unknown Business",
    placeId: targetPlaceId,
    keyword: scanKeyword || "(no keyword)",
    center,
    gridSize: size,
    spacingKm: spacing,
    createdAt: new Date().toISOString(),
    gridPoints: results,
    competitors,
    avgRank: avgRank === null ? null : parseFloat(avgRank.toFixed(2)),
    top3Pct: parseFloat(top3Pct.toFixed(2)),
    totalPoints: results.length,
  };

  await saveScan(savedScan);

  return NextResponse.json({ scan: savedScan, budget: budgetStatus });
}
