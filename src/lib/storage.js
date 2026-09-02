import { createAdminClient } from "./supabase-server";

// Ã¢â€â‚¬Ã¢â€â‚¬ Public API Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function buildCompetitorSummaries(gridPoints, targetPlaceId) {
  const map = new Map();

  for (const point of gridPoints) {
    for (const comp of point.competitors) {
      if (comp.placeId === targetPlaceId || comp.isTarget) continue;
      if (!map.has(comp.placeId)) {
        map.set(comp.placeId, { 
          name: comp.name, 
          ranks: [], 
          top3: 0,
          lat: comp.lat,
          lng: comp.lng,
        });
      }
      const entry = map.get(comp.placeId);
      entry.ranks.push(comp.rank);
      if (comp.rank <= 3) entry.top3++;
    }
  }

  const totalPoints = gridPoints.length;
  const summaries = [];

  for (const [placeId, data] of map) {
    const missingPoints = totalPoints - data.ranks.length;
    const rankTotal = data.ranks.reduce((s, r) => s + r, 0) + missingPoints * 21;
    const avgRank = rankTotal / totalPoints;
    const bestRank = Math.min(...data.ranks);
    summaries.push({
      placeId,
      name: data.name,
      avgRank: parseFloat(avgRank.toFixed(2)),
      bestRank,
      top3Pct: parseFloat(((data.top3 / totalPoints) * 100).toFixed(2)),
      appearances: data.ranks.length,
      lat: data.lat,
      lng: data.lng,
    });
  }

  summaries.sort((a, b) => a.avgRank - b.avgRank || b.appearances - a.appearances || a.bestRank - b.bestRank);
  return summaries;
}

/** Insert a scan row into Supabase. */
export async function saveScan(scan) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("scans").insert({
    id: scan.id,
    business_name: scan.businessName,
    place_id: scan.placeId,
    keyword: scan.keyword,
    center: scan.center,
    grid_size: scan.gridSize,
    spacing_km: scan.spacingKm,
    created_at: scan.createdAt,
    grid_points: scan.gridPoints,
    competitors: scan.competitors,
    avg_rank: scan.avgRank,
    top3_pct: scan.top3Pct,
    total_points: scan.totalPoints,
  });
  if (error) throw new Error(`saveScan: ${error.message}`);
}



export async function createScanJob(job) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("scan_jobs").insert({
    id: job.id,
    status: "queued",
    request: job.request,
    total_points: job.totalPoints,
    completed_points: 0,
    total_keywords: job.totalKeywords,
    completed_keywords: 0,
    active_keyword: job.activeKeyword ?? "",
    scan_ids: [],
    error: null,
    created_at: job.createdAt,
    updated_at: job.createdAt,
  });
  if (error) throw new Error(`createScanJob: ${error.message}`);
}

export async function updateScanJob(id, updates) {
  const supabase = createAdminClient();
  const row = {
    ...("status" in updates && { status: updates.status }),
    ...("completedPoints" in updates && { completed_points: updates.completedPoints }),
    ...("completedKeywords" in updates && { completed_keywords: updates.completedKeywords }),
    ...("activeKeyword" in updates && { active_keyword: updates.activeKeyword }),
    ...("scanIds" in updates && { scan_ids: updates.scanIds }),
    ...("error" in updates && { error: updates.error }),
    ...("finishedAt" in updates && { finished_at: updates.finishedAt }),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("scan_jobs").update(row).eq("id", id);
  if (error) throw new Error(`updateScanJob: ${error.message}`);
}

export async function getScanJob(id) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getScanJob: ${error.message}`);
  return data ? toAppScanJob(data) : null;
}

export async function getLatestActiveScanJob() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_jobs")
    .select("*")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestActiveScanJob: ${error.message}`);
  return data ? toAppScanJob(data) : null;
}

/** List all scans (summary only, no heavy grid data). */
export async function listScans() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scans")
    .select("id, business_name, place_id, keyword, grid_size, spacing_km, created_at, avg_rank, top3_pct, total_points")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listScans: ${error.message}`);
  return (data ?? []).map(toAppScan);
}

/** Get a single scan by ID (full data including grid points). */
export async function getScan(id) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getScan: ${error.message}`);
  return data ? toAppScan(data) : null;
}

/** Delete a scan by ID. Returns true if deleted. */
export async function deleteScan(id) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scans")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteScan: ${error.message}`);
  return (data ?? []).length > 0;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Map DB columns (snake_case) Ã¢â€ â€™ app format (camelCase) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function toAppScan(row) {
  return {
    id: row.id,
    businessName: row.business_name,
    placeId: row.place_id,
    keyword: row.keyword,
    center: row.center,
    gridSize: row.grid_size,
    spacingKm: row.spacing_km,
    createdAt: row.created_at,
    gridPoints: row.grid_points,
    competitors: row.competitors,
    avgRank: row.avg_rank,
    top3Pct: row.top3_pct,
    totalPoints: row.total_points,
  };
}

function toAppScanJob(row) {
  return {
    id: row.id,
    status: row.status,
    request: row.request,
    totalPoints: row.total_points,
    completedPoints: row.completed_points,
    totalKeywords: row.total_keywords,
    completedKeywords: row.completed_keywords,
    activeKeyword: row.active_keyword,
    scanIds: row.scan_ids ?? [],
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}
