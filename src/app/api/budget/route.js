import { NextResponse } from "next/server";
import { getAllBudgetStatuses } from "@/lib/budget";
import { getCurrentUser } from "@/lib/supabase-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  return NextResponse.json(await getAllBudgetStatuses());
}
