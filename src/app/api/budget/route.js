import { NextResponse } from "next/server";
import { getBudgetStatus } from "@/lib/budget";

export async function GET() {
  return NextResponse.json(await getBudgetStatus());
}
