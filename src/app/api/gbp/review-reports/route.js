import { NextResponse } from "next/server";
import { listReviewReports, saveReviewReport } from "@/lib/review-reports";

export async function GET() {
  try {
    const reports = await listReviewReports();
    return NextResponse.json({ reports });
  } catch (err) {
    console.error("[GBP review reports list]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const report = await saveReviewReport({
      title: payload.title,
      startDate: payload.startDate,
      endDate: payload.endDate,
      monthLabel: payload.monthLabel,
      locations: payload.locations ?? [],
      manualValues: payload.manualValues ?? {},
      computedValues: payload.computedValues ?? {},
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[GBP review reports save]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
