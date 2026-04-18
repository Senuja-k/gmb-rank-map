import { NextResponse } from "next/server";
import { listScans } from "@/lib/storage";

export async function GET() {
  const scans = await listScans();
  const summaries = scans.map((s) => ({
    id: s.id,
    businessName: s.businessName,
    keyword: s.keyword,
    gridSize: s.gridSize,
    spacingKm: s.spacingKm,
    createdAt: s.createdAt,
    avgRank: s.avgRank,
    top3Pct: s.top3Pct,
    totalPoints: s.totalPoints,
  }));
  return NextResponse.json(summaries);
}
