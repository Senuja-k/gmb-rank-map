import { createAdminClient } from "./supabase-server";

// ── Config ──────────────────────────────────────────────────────────────────
const FREE_TEXT_SEARCH_PRO = 5000;
const FREE_NEARBY_SEARCH_PRO = 5000;
export const FREE_GEMINI_SEARCH_GROUNDING_PROMPTS = 5000;
const COST_PER_REQUEST = 0.032;
const GEMINI_SEARCH_GROUNDING_OVERAGE_PER_1000 = 14;
export const API_KEY_COUNT = 2;

// ── Helpers ─────────────────────────────────────────────────────────────────

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Load (or create) the current month's budget row for a specific API key. */
async function loadBudget(apiKeyIndex = 0) {
  const supabase = createAdminClient();
  const month = currentMonth();
  const { data, error } = await supabase
    .from("budget")
    .select("*")
    .eq("month", month)
    .eq("api_key_index", apiKeyIndex)
    .maybeSingle();
  if (error) throw new Error(`loadBudget: ${error.message}`);
  if (data) return data;
  // First call this month for this key — insert a fresh row
  const fresh = {
    month,
    api_key_index: apiKeyIndex,
    text_search_calls: 0,
    nearby_search_calls: 0,
    gemini_search_grounding_prompts: 0,
  };
  const { error: insErr } = await supabase.from("budget").insert(fresh);
  if (insErr) throw new Error(`loadBudget insert: ${insErr.message}`);
  return fresh;
}

function formatKeyStatus(data) {
  const textSearchCalls = data.text_search_calls ?? 0;
  const nearbySearchCalls = data.nearby_search_calls ?? 0;
  const geminiSearchGroundingPrompts = data.gemini_search_grounding_prompts ?? 0;
  const textRemaining = FREE_TEXT_SEARCH_PRO - textSearchCalls;
  const nearbyRemaining = FREE_NEARBY_SEARCH_PRO - nearbySearchCalls;
  const geminiSearchGroundingRemaining = FREE_GEMINI_SEARCH_GROUNDING_PROMPTS - geminiSearchGroundingPrompts;
  const totalRemaining = textRemaining + nearbyRemaining;
  return {
    month: data.month,
    apiKeyIndex: data.api_key_index,
    textSearchCalls,
    textSearchLimit: FREE_TEXT_SEARCH_PRO,
    textSearchRemaining: Math.max(0, textRemaining),
    nearbySearchCalls,
    nearbySearchLimit: FREE_NEARBY_SEARCH_PRO,
    nearbySearchRemaining: Math.max(0, nearbyRemaining),
    totalCalls: textSearchCalls + nearbySearchCalls,
    totalFreeLimit: FREE_TEXT_SEARCH_PRO + FREE_NEARBY_SEARCH_PRO,
    totalRemaining: Math.max(0, totalRemaining),
    costPerRequest: COST_PER_REQUEST,
    geminiSearchGroundingPrompts,
    geminiSearchGroundingLimit: FREE_GEMINI_SEARCH_GROUNDING_PROMPTS,
    geminiSearchGroundingRemaining: Math.max(0, geminiSearchGroundingRemaining),
    geminiSearchGroundingOveragePer1000: GEMINI_SEARCH_GROUNDING_OVERAGE_PER_1000,
    geminiSearchGroundingBlocked: geminiSearchGroundingRemaining <= 0,
    blocked: totalRemaining <= 0,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Status for a single API key (defaults to key 0). */
export async function getBudgetStatus(apiKeyIndex = 0) {
  const data = await loadBudget(apiKeyIndex);
  return formatKeyStatus(data);
}

/** Status for all API keys. */
export async function getAllBudgetStatuses() {
  const statuses = await Promise.all(
    Array.from({ length: API_KEY_COUNT }, (_, i) => loadBudget(i).then(formatKeyStatus))
  );
  return statuses;
}

export async function canAffordScan(pointCount, usesTextSearch, apiKeyIndex = 0) {
  const data = await loadBudget(apiKeyIndex);
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

export async function recordSpend(callsMade, usesTextSearch, apiKeyIndex = 0) {
  const supabase = createAdminClient();
  const data = await loadBudget(apiKeyIndex);
  const col = usesTextSearch ? "text_search_calls" : "nearby_search_calls";
  const newVal = (usesTextSearch ? data.text_search_calls : data.nearby_search_calls) + callsMade;
  const { error } = await supabase
    .from("budget")
    .update({ [col]: newVal })
    .eq("month", data.month)
    .eq("api_key_index", apiKeyIndex);
  if (error) throw new Error(`recordSpend: ${error.message}`);
}

export async function getGeminiSearchGroundingStatus() {
  const data = await loadBudget(0);
  const status = formatKeyStatus(data);
  return {
    month: status.month,
    prompts: status.geminiSearchGroundingPrompts,
    limit: status.geminiSearchGroundingLimit,
    remaining: status.geminiSearchGroundingRemaining,
    overagePer1000: status.geminiSearchGroundingOveragePer1000,
    blocked: status.geminiSearchGroundingBlocked,
  };
}

export async function canAffordGeminiSearchGrounding(prompts = 1) {
  const status = await getGeminiSearchGroundingStatus();
  return {
    allowed: prompts <= status.remaining,
    estimatedPrompts: prompts,
    remaining: status.remaining,
    limit: status.limit,
    status,
  };
}

export async function recordGeminiSearchGrounding(prompts = 1) {
  const supabase = createAdminClient();
  const data = await loadBudget(0);
  const newVal = (data.gemini_search_grounding_prompts ?? 0) + prompts;
  const { error } = await supabase
    .from("budget")
    .update({ gemini_search_grounding_prompts: newVal })
    .eq("month", data.month)
    .eq("api_key_index", 0);
  if (error) throw new Error(`recordGeminiSearchGrounding: ${error.message}`);
  return getGeminiSearchGroundingStatus();
}
