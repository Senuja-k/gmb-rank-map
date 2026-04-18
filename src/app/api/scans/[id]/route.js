import { NextResponse } from "next/server";
import { getScan, deleteScan } from "@/lib/storage";

export async function GET(_req, { params }) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }
  return NextResponse.json(scan);
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  const deleted = await deleteScan(id);
  if (!deleted) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
