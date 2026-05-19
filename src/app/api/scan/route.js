import { NextResponse } from "next/server";
import { canAffordScan, recordSpend, getBudgetStatus, API_KEY_COUNT } from "@/lib/budget";
import {
  generateId,
  saveScan,
  buildCompetitorSummaries,
} from "@/lib/storage";

// ── Helpers ─────────────────────────────────────────────────────────────────

const KM_PER_DEG_LAT = 111.32;

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

// ── Rank a single grid point (captures all competitors) ─────────────────────

async function rankAtPoint(point, keyword, targetPlaceId, apiKey) {
  const hasKeyword = keyword.trim().length > 0;
  let places = [];

  if (hasKeyword) {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName",
        },
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
      }
    );

    if (!res.ok) {
      console.error(`Text Search failed at (${point.lat}, ${point.lng}): ${res.status}`);
      return { lat: point.lat, lng: point.lng, rank: 21, competitors: [] };
    }
    const data = await res.json();
    places = data.places ?? [];
  } else {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName",
        },
        body: JSON.stringify({
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: { latitude: point.lat, longitude: point.lng },
              radius: 1000.0,
            },
          },
        }),
      }
    );

    if (!res.ok) {
      console.error(`Nearby Search failed at (${point.lat}, ${point.lng}): ${res.status}`);
      return { lat: point.lat, lng: point.lng, rank: 21, competitors: [] };
    }
    const data = await res.json();
    places = data.places ?? [];
  }

  const competitors = places.map((p, idx) => ({
    placeId: (p.id ?? "").replace("places/", ""),
    name: p.displayName?.text ?? "Unknown",
    rank: idx + 1,
  }));

  const idx = places.findIndex((p) => {
    const id = (p.id ?? "").replace("places/", "");
    return id === targetPlaceId;
  });

  return {
    lat: point.lat,
    lng: point.lng,
    rank: idx === -1 ? 21 : idx + 1,
    competitors,
  };
}

// ── POST handler ────────────────────────────────────────────────────────────

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { targetPlaceId, businessName, keyword, center, gridSize, spacingKm, customGrid, force, apiKeyIndex: rawKeyIndex } = body;

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

  if (
    !targetPlaceId ||
    !center ||
    typeof center.lat !== "number" ||
    typeof center.lng !== "number" ||
    !gridSize
  ) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const size = Math.min(Math.max(gridSize, 3), 13);
  const spacing = spacingKm || 1;
  const usesTextSearch = keyword.trim().length > 0;

  // Use custom grid points from drawn shape if provided, otherwise generate standard grid
  const grid = (Array.isArray(customGrid) && customGrid.length > 0)
    ? customGrid.map((p) => ({ lat: p.lat, lng: p.lng }))
    : generateGrid(center, size, spacing);

  const pointCount = grid.length;

  // ── Budget gate ─────────────────────────────────────────────────────────
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
  const CONCURRENCY = 3;
  const DELAY_MS = 200;

  for (let i = 0; i < grid.length; i += CONCURRENCY) {
    const batch = grid.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((point) => rankAtPoint(point, keyword, targetPlaceId, apiKey))
    );
    results.push(...batchResults);
    if (i + CONCURRENCY < grid.length) await sleep(DELAY_MS);
  }

  // ── Record spend ──────────────────────────────────────────────────────
  await recordSpend(grid.length, usesTextSearch, apiKeyIndex);
  const budgetStatus = await getBudgetStatus(apiKeyIndex);

  // ── Build competitor summaries & stats ─────────────────────────────────
  const competitors = buildCompetitorSummaries(results, targetPlaceId);
  const avgRank = results.reduce((s, r) => s + r.rank, 0) / results.length;
  const top3Count = results.filter((r) => r.rank <= 3).length;
  const top3Pct = (top3Count / results.length) * 100;

  // ── Save scan ─────────────────────────────────────────────────────────
  const scanId = generateId();
  const savedScan = {
    id: scanId,
    businessName: businessName || "Unknown Business",
    placeId: targetPlaceId,
    keyword: keyword || "(no keyword)",
    center,
    gridSize: size,
    spacingKm: spacing,
    createdAt: new Date().toISOString(),
    gridPoints: results,
    competitors,
    avgRank: parseFloat(avgRank.toFixed(2)),
    top3Pct: parseFloat(top3Pct.toFixed(2)),
    totalPoints: results.length,
  };

  await saveScan(savedScan);

  return NextResponse.json({ scan: savedScan, budget: budgetStatus });
}
