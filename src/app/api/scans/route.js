import { NextResponse } from "next/server";
import { deleteScans, listScans } from "@/lib/storage";

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


export async function DELETE(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) {
    return NextResponse.json({ error: "Required: ids array." }, { status: 400 });
  }

  try {
    const deletedCount = await deleteScans(ids);
    return NextResponse.json({ success: true, deletedCount });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
