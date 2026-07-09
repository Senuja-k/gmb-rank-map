import { NextResponse } from "next/server";
import { getAllBudgetStatuses } from "@/lib/budget";
import { clearAuthCookies, getCurrentUser } from "@/lib/supabase-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    const response = NextResponse.json({ error: "Authentication required." }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  return NextResponse.json(await getAllBudgetStatuses());
}
