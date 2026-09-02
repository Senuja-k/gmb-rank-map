import { NextResponse } from "next/server";
import { createScanJob, generateId, getLatestActiveScanJob } from "@/lib/storage";
import { assertScanBatchCanStart, assertScanCanStart, normalizeScanRequest, runScanJob } from "@/lib/scan-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

const activeJobs = globalThis.__rankMapActiveJobs ?? new Map();
globalThis.__rankMapActiveJobs = activeJobs;

function startWorker(jobId, requests) {
  if (activeJobs.has(jobId)) return;
  const promise = runScanJob(jobId, requests)
    .catch((err) => console.error(`[scan job ${jobId}]`, err))
    .finally(() => activeJobs.delete(jobId));
  activeJobs.set(jobId, promise);
}

export async function GET() {
  const job = await getLatestActiveScanJob();
  return NextResponse.json({ job });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const rawKeywords = Array.isArray(body.keywords) ? body.keywords : [body.keyword];
    const keywords = rawKeywords.map((k) => String(k ?? "").trim()).filter(Boolean);
    if (!keywords.length) keywords.push("");

    const requests = keywords.map((keyword) => normalizeScanRequest({ ...body, keyword }));
    for (const request of requests) await assertScanCanStart(request);
    await assertScanBatchCanStart(requests);

    const jobId = generateId();
    const createdAt = new Date().toISOString();
    await createScanJob({
      id: jobId,
      request: {
        targetPlaceId: requests[0].targetPlaceId,
        businessName: requests[0].businessName,
        center: requests[0].center,
        gridSize: requests[0].gridSize,
        spacingKm: requests[0].spacingKm,
        keywords: requests.map((request) => request.keyword),
        apiKeyIndex: requests[0].apiKeyIndex,
      },
      totalPoints: requests.reduce((sum, request) => sum + request.grid.length, 0),
      totalKeywords: requests.length,
      activeKeyword: requests[0].keyword || "(no keyword)",
      createdAt,
    });

    startWorker(jobId, requests);
    return NextResponse.json({ jobId, status: "queued" }, { status: 202 });
  } catch (err) {
    const status = Number.isInteger(err.status) ? err.status : 500;
    return NextResponse.json({ error: err.message, budget: err.budget }, { status });
  }
}