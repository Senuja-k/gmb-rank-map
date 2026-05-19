import { NextResponse } from "next/server";
import { getAllBudgetStatuses } from "@/lib/budget";

export async function GET() {
  return NextResponse.json(await getAllBudgetStatuses());
}
