import { supabase } from "./supabase";

// ── Public API ──────────────────────────────────────────────────────────────

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function buildCompetitorSummaries(gridPoints, targetPlaceId) {
  const map = new Map();

  for (const point of gridPoints) {
    for (const comp of point.competitors) {
      if (comp.placeId === targetPlaceId) continue;
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
    const avgRank =
      data.ranks.reduce((s, r) => s + r, 0) / data.ranks.length;
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

  summaries.sort((a, b) => a.avgRank - b.avgRank);
  return summaries;
}

/** Insert a scan row into Supabase. */
export async function saveScan(scan) {
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

/** List all scans (summary only, no heavy grid data). */
export async function listScans() {
  const { data, error } = await supabase
    .from("scans")
    .select("id, business_name, place_id, keyword, grid_size, spacing_km, created_at, avg_rank, top3_pct, total_points")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listScans: ${error.message}`);
  return (data ?? []).map(toAppScan);
}

/** Get a single scan by ID (full data including grid points). */
export async function getScan(id) {
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
  const { data, error } = await supabase
    .from("scans")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteScan: ${error.message}`);
  return (data ?? []).length > 0;
}

// ── Map DB columns (snake_case) → app format (camelCase) ────────────────────
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
