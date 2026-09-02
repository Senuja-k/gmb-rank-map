import { getAllBudgetStatuses, recordSpend, getBudgetStatus, API_KEY_COUNT } from "./budget";
import { generateId, saveScan } from "./storage";

const KM_PER_DEG_LAT = 111.32;
const FIELD_MASK = "places.id,places.displayName,places.location";
const REQUEST_DELAY_MS = 350;
const API_KEY_ENV_NAMES = ["GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_API_KEY_2"];

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
      points.push({ lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) });
    }
  }
  return points;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateGridPoint(point) {
  return point && typeof point.lat === "number" && typeof point.lng === "number" &&
    Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180;
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
  return { lat: point.lat, lng: point.lng, rank: null, status, competitors: [], ...extra };
}

function normalizeBusinessName(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function targetNameCandidates(value) {
  const raw = String(value || "");
  return [raw, raw.split(" - ")[0], raw.split(" | ")[0]].map(normalizeBusinessName).filter((name) => name.length >= 5);
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
  const headers = { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK };
  if (hasKeyword) {
    return {
      requestKind: "Text Search",
      url: "https://places.googleapis.com/v1/places:searchText",
      options: { method: "POST", headers, body: JSON.stringify({ textQuery: keyword, maxResultCount: 20, locationBias: { circle: { center: { latitude: point.lat, longitude: point.lng }, radius: 1000.0 } } }) },
    };
  }
  return {
    requestKind: "Nearby Search",
    url: "https://places.googleapis.com/v1/places:searchNearby",
    options: { method: "POST", headers, body: JSON.stringify({ maxResultCount: 20, locationRestriction: { circle: { center: { latitude: point.lat, longitude: point.lng }, radius: 1000.0 } } }) },
  };
}

async function rankAtPoint(point, keyword, targetPlaceId, targetBusinessName, apiKey, apiKeyIndex) {
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
    console.error(`${requestKind} failed at (${point.lat}, ${point.lng}): ${httpStatus ?? "network_error"}`, googleError);
    return emptyPointResult(point, "api_error", {
      errorType: httpStatus ? errorTypeForStatus(httpStatus) : "network_error",
      httpStatus,
      errorSource: httpStatus ? errorSourceForStatus(httpStatus) : "network_error",
      googleError,
      apiAttempts,
    });
  }
  const data = await res.json();
  const places = data.places ?? [];
  if (places.length === 0) return emptyPointResult(point, "zero_results", { apiAttempts });
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
  return { lat: point.lat, lng: point.lng, rank: idx === -1 ? 21 : idx + 1, status: "ok", competitors, apiAttempts, matchedBy, apiKeyIndex };
}

function buildCompetitorSummaries(gridPoints, targetPlaceId) {
  const map = new Map();
  for (const point of gridPoints) {
    for (const comp of point.competitors) {
      if (comp.placeId === targetPlaceId || comp.isTarget) continue;
      if (!map.has(comp.placeId)) map.set(comp.placeId, { name: comp.name, ranks: [], top3: 0, lat: comp.lat, lng: comp.lng });
      const entry = map.get(comp.placeId);
      entry.ranks.push(comp.rank);
      if (comp.rank <= 3) entry.top3++;
    }
  }
  const totalPoints = gridPoints.length;
  return Array.from(map.entries()).map(([placeId, data]) => {
    const missingPoints = totalPoints - data.ranks.length;
    const rankTotal = data.ranks.reduce((s, r) => s + r, 0) + missingPoints * 21;
    return {
      placeId,
      name: data.name,
      avgRank: parseFloat((rankTotal / totalPoints).toFixed(2)),
      bestRank: Math.min(...data.ranks),
      top3Pct: parseFloat(((data.top3 / totalPoints) * 100).toFixed(2)),
      appearances: data.ranks.length,
      lat: data.lat,
      lng: data.lng,
    };
  }).sort((a, b) => a.avgRank - b.avgRank || b.appearances - a.appearances || a.bestRank - b.bestRank);
}

export function normalizeScanRequest(body) {
  const { targetPlaceId, businessName, keyword, center, gridSize, spacingKm, customGrid, force, apiKeyIndex: rawKeyIndex } = body;
  const apiKeyIndex = Number.isInteger(rawKeyIndex) && rawKeyIndex >= 0 && rawKeyIndex < API_KEY_COUNT ? rawKeyIndex : 0;
  if (!targetPlaceId || !center || !gridSize) throw Object.assign(new Error("Missing required fields."), { status: 400 });
  if (!validateGridPoint(center)) throw Object.assign(new Error("Invalid scan center coordinates."), { status: 400 });
  const numericGridSize = Number(gridSize);
  const numericSpacing = spacingKm === undefined || spacingKm === null || spacingKm === "" ? 1 : Number(spacingKm);
  if (!Number.isFinite(numericGridSize) || numericGridSize <= 0 || !Number.isFinite(numericSpacing) || numericSpacing <= 0) {
    throw Object.assign(new Error("Invalid grid size or spacing."), { status: 400 });
  }
  const size = Math.min(Math.max(numericGridSize, 3), 13);
  const grid = Array.isArray(customGrid) && customGrid.length > 0
    ? customGrid.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    : generateGrid(center, size, numericSpacing);
  const invalidPointIndex = grid.findIndex((point) => !validateGridPoint(point));
  if (invalidPointIndex !== -1) throw Object.assign(new Error(`Invalid coordinates for grid point ${invalidPointIndex + 1}.`), { status: 400 });
  return {
    targetPlaceId,
    businessName: businessName || "Unknown Business",
    keyword: typeof keyword === "string" ? keyword : "",
    center,
    gridSize: size,
    spacingKm: numericSpacing,
    grid,
    force: Boolean(force),
    apiKeyIndex,
  };
}

function getConfiguredApiKeyIndexes() {
  return API_KEY_ENV_NAMES
    .map((envName, index) => ({ envName, index, apiKey: process.env[envName] }))
    .filter((entry) => Boolean(entry.apiKey));
}

function orderedKeyIndexes(preferredApiKeyIndex) {
  const configured = getConfiguredApiKeyIndexes().map((entry) => entry.index);
  return [preferredApiKeyIndex, ...configured.filter((index) => index !== preferredApiKeyIndex)]
    .filter((index, position, list) => configured.includes(index) && list.indexOf(index) === position);
}

export async function assertScanCanStart(request) {
  if (!getConfiguredApiKeyIndexes().length) {
    throw Object.assign(new Error("No Google Maps API keys are configured on the server."), { status: 500 });
  }
  if (!process.env[API_KEY_ENV_NAMES[request.apiKeyIndex]]) {
    throw Object.assign(new Error(`API key ${request.apiKeyIndex + 1} is not configured on the server.`), { status: 500 });
  }
}

export async function assertScanBatchCanStart(requests) {
  const statuses = await getAllBudgetStatuses();
  const force = requests.some((request) => request.force);
  const totals = new Map();

  for (const request of requests) {
    const usesTextSearch = request.keyword.trim().length > 0;
    const key = usesTextSearch ? "text" : "nearby";
    totals.set(key, (totals.get(key) ?? 0) + request.grid.length);
  }

  for (const [kind, needed] of totals) {
    const usesTextSearch = kind === "text";
    const available = statuses.reduce((sum, status) => {
      if (!process.env[API_KEY_ENV_NAMES[status.apiKeyIndex]]) return sum;
      return sum + (usesTextSearch ? status.textSearchRemaining : status.nearbySearchRemaining);
    }, 0);

    if (needed > available && !force) {
      const apiName = usesTextSearch ? "Text Search" : "Nearby Search";
      const status = await getBudgetStatus(requests[0]?.apiKeyIndex ?? 0);
      const error = new Error(`Monthly free limit reached for ${apiName} across configured keys (${available} free calls remaining, ${needed} needed). Resets next month.`);
      error.status = 429;
      error.budget = status;
      throw error;
    }
  }
}

async function createApiKeyAllocator(preferredApiKeyIndex, usesTextSearch, force) {
  const statuses = await getAllBudgetStatuses();
  const remainingByKey = new Map(
    statuses.map((status) => [
      status.apiKeyIndex,
      usesTextSearch ? status.textSearchRemaining : status.nearbySearchRemaining,
    ])
  );
  const order = orderedKeyIndexes(preferredApiKeyIndex);
  if (!order.length) throw Object.assign(new Error("No Google Maps API keys are configured on the server."), { status: 500 });

  return function nextApiKey() {
    const freeKeyIndex = order.find((apiKeyIndex) => (remainingByKey.get(apiKeyIndex) ?? 0) > 0);
    const apiKeyIndex = freeKeyIndex ?? (force ? order[0] : null);
    if (apiKeyIndex === null) {
      const apiName = usesTextSearch ? "Text Search" : "Nearby Search";
      throw Object.assign(new Error(`Monthly free limit reached for ${apiName} across configured keys.`), { status: 429 });
    }
    const remaining = remainingByKey.get(apiKeyIndex) ?? 0;
    if (remaining > 0) remainingByKey.set(apiKeyIndex, remaining - 1);
    return { apiKeyIndex, apiKey: process.env[API_KEY_ENV_NAMES[apiKeyIndex]] };
  };
}
export async function runSingleScan(request, onProgress) {
  const usesTextSearch = request.keyword.trim().length > 0;
  const nextApiKey = await createApiKeyAllocator(request.apiKeyIndex, usesTextSearch, request.force);
  const results = [];
  let recordedSpend = 0;
  let activeApiKeyIndex = request.apiKeyIndex;
  for (let i = 0; i < request.grid.length; i++) {
    const key = nextApiKey();
    activeApiKeyIndex = key.apiKeyIndex;
    const result = await rankAtPoint(request.grid[i], request.keyword, request.targetPlaceId, request.businessName, key.apiKey, key.apiKeyIndex);
    results.push(result);
    const apiSpend = result.apiAttempts || 0;
    if (apiSpend) {
      await recordSpend(apiSpend, usesTextSearch, key.apiKeyIndex);
      recordedSpend += apiSpend;
    }
    await onProgress?.({ completedPoints: i + 1, totalPoints: request.grid.length, recordedSpend, apiKeyIndex: activeApiKeyIndex });
    if (i + 1 < request.grid.length) await sleep(REQUEST_DELAY_MS);
  }
  const budgetStatus = await getBudgetStatus(activeApiKeyIndex);
  const validResults = results.filter((r) => r.status === "ok" && typeof r.rank === "number");
  const competitors = buildCompetitorSummaries(validResults, request.targetPlaceId);
  const avgRank = validResults.length ? validResults.reduce((s, r) => s + r.rank, 0) / validResults.length : null;
  const top3Count = validResults.filter((r) => r.rank <= 3).length;
  const top3Pct = validResults.length ? (top3Count / validResults.length) * 100 : 0;
  const scanId = generateId();
  const savedScan = {
    id: scanId,
    businessName: request.businessName,
    placeId: request.targetPlaceId,
    keyword: request.keyword || "(no keyword)",
    center: request.center,
    gridSize: request.gridSize,
    spacingKm: request.spacingKm,
    createdAt: new Date().toISOString(),
    gridPoints: results,
    competitors,
    avgRank: avgRank === null ? null : parseFloat(avgRank.toFixed(2)),
    top3Pct: parseFloat(top3Pct.toFixed(2)),
    totalPoints: results.length,
  };
  await saveScan(savedScan);
  return { scan: savedScan, budget: budgetStatus };
}
