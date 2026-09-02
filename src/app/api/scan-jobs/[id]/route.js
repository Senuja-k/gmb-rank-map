import { NextResponse } from "next/server";
import { getScanJob } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const { id } = await params;
  const job = await getScanJob(id);
  if (!job) return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
  return NextResponse.json({ job });
}