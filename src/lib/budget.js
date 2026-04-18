import { supabase } from "./supabase";

// ── Config ──────────────────────────────────────────────────────────────────
const FREE_TEXT_SEARCH_PRO = 5000;
const FREE_NEARBY_SEARCH_PRO = 5000;
const COST_PER_REQUEST = 0.032;

// ── Helpers ─────────────────────────────────────────────────────────────────

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function emptyRow() {
  return { month: currentMonth(), text_search_calls: 0, nearby_search_calls: 0 };
}

/** Load (or create) the current month's budget row. */
async function loadBudget() {
  const month = currentMonth();
  const { data, error } = await supabase
    .from("budget")
    .select("*")
    .eq("month", month)
    .maybeSingle();
  if (error) throw new Error(`loadBudget: ${error.message}`);
  if (data) return data;
  // First call this month — insert a fresh row
  const fresh = emptyRow();
  const { error: insErr } = await supabase.from("budget").insert(fresh);
  if (insErr) throw new Error(`loadBudget insert: ${insErr.message}`);
  return fresh;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getBudgetStatus() {
  const data = await loadBudget();
  const textRemaining = FREE_TEXT_SEARCH_PRO - data.text_search_calls;
  const nearbyRemaining = FREE_NEARBY_SEARCH_PRO - data.nearby_search_calls;
  const totalCalls = data.text_search_calls + data.nearby_search_calls;
  const totalFree = FREE_TEXT_SEARCH_PRO + FREE_NEARBY_SEARCH_PRO;
  const totalRemaining = textRemaining + nearbyRemaining;

  return {
    month: data.month,
    textSearchCalls: data.text_search_calls,
    textSearchLimit: FREE_TEXT_SEARCH_PRO,
    textSearchRemaining: Math.max(0, textRemaining),
    nearbySearchCalls: data.nearby_search_calls,
    nearbySearchLimit: FREE_NEARBY_SEARCH_PRO,
    nearbySearchRemaining: Math.max(0, nearbyRemaining),
    totalCalls,
    totalFreeLimit: totalFree,
    totalRemaining: Math.max(0, totalRemaining),
    costPerRequest: COST_PER_REQUEST,
    blocked: totalRemaining <= 0,
  };
}

export async function canAffordScan(pointCount, usesTextSearch) {
  const data = await loadBudget();
  const used = usesTextSearch ? data.text_search_calls : data.nearby_search_calls;
  const limit = usesTextSearch ? FREE_TEXT_SEARCH_PRO : FREE_NEARBY_SEARCH_PRO;
  const remaining = Math.max(0, limit - used);
  return {
    allowed: pointCount <= remaining,
    estimatedCalls: pointCount,
    remaining,
    limit,
  };
}

export async function recordSpend(callsMade, usesTextSearch) {
  const data = await loadBudget();
  const col = usesTextSearch ? "text_search_calls" : "nearby_search_calls";
  const newVal = (usesTextSearch ? data.text_search_calls : data.nearby_search_calls) + callsMade;
  const { error } = await supabase
    .from("budget")
    .update({ [col]: newVal })
    .eq("month", data.month);
  if (error) throw new Error(`recordSpend: ${error.message}`);
}
