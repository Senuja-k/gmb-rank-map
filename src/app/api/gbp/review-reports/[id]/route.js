import { NextResponse } from "next/server";
import { deleteReviewReport, getReviewReport, updateReviewReportSnapshot } from "@/lib/review-reports";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const report = await getReviewReport(id);
    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[GBP review report get]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const report = await updateReviewReportSnapshot(id, {
      manualValues: payload.manualValues ?? {},
      computedValues: payload.computedValues ?? {},
    });
    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[GBP review report patch]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    const deleted = await deleteReviewReport(id);
    if (!deleted) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[GBP review report delete]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
