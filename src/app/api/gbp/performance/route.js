/**
 * GET /api/gbp/performance?accountId=xxx&locationName=accounts/x/locations/y
 *                         &startYear=2026&startMonth=1&startDay=1
 *                         &endYear=2026&endMonth=5&endDay=1
 *
 * Returns an array of multiDailyMetricTimeSeries objects for the dashboard table.
 */

import { NextResponse } from "next/server";
import { getShowroomStats } from "@/lib/gbp";

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const email = searchParams.get("email");
  const locationName = searchParams.get("locationName");

  if (!email || !locationName) {
    return NextResponse.json(
      { error: "Required query params: email, locationName." },
      { status: 400 }
    );
  }

  const dateRange = {
    startYear: Number(searchParams.get("startYear") ?? 2026),
    startMonth: Number(searchParams.get("startMonth") ?? 1),
    startDay: Number(searchParams.get("startDay") ?? 1),
    endYear: Number(searchParams.get("endYear") ?? 2026),
    endMonth: Number(searchParams.get("endMonth") ?? 5),
    endDay: Number(searchParams.get("endDay") ?? 1),
  };

  try {
    const data = await getShowroomStats(email, locationName, dateRange);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GBP performance]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
