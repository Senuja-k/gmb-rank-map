import { NextResponse } from "next/server";
import { assertScanBatchCanStart, assertScanCanStart, normalizeScanRequest, runSingleScan } from "@/lib/scan-runner";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const request = normalizeScanRequest(body);
    await assertScanCanStart(request);
    await assertScanBatchCanStart([request]);
    const result = await runSingleScan(request);
    return NextResponse.json(result);
  } catch (err) {
    const status = Number.isInteger(err.status) ? err.status : 500;
    return NextResponse.json({ error: err.message, budget: err.budget }, { status });
  }
}