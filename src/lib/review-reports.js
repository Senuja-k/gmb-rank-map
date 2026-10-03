import { createAdminClient } from "./supabase-server";
import { generateId } from "./storage";

const REVIEW_REPORT_RETENTION_MONTHS = 1;

function toAppReport(row) {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    monthLabel: row.month_label,
    locations: row.locations ?? [],
    manualValues: row.manual_values ?? {},
    computedValues: row.computed_values ?? {},
    createdAt: row.created_at,
  };
}

function getReviewReportRetentionCutoff() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - REVIEW_REPORT_RETENTION_MONTHS);
  return cutoff.toISOString();
}

export async function cleanupOldReviewReports(supabase = createAdminClient()) {
  const { data, error } = await supabase
    .from("gbp_review_reports")
    .delete()
    .lt("created_at", getReviewReportRetentionCutoff())
    .select("id");

  if (error) throw new Error(`cleanupOldReviewReports: ${error.message}`);
  return { deletedCount: (data ?? []).length };
}

async function cleanupOldReviewReportsSafely(supabase) {
  try {
    return await cleanupOldReviewReports(supabase);
  } catch (err) {
    console.warn("[GBP review reports cleanup]", err);
    return { deletedCount: 0, error: err.message };
  }
}

export async function listReviewReports() {
  const supabase = createAdminClient();
  await cleanupOldReviewReportsSafely(supabase);

  const { data, error } = await supabase
    .from("gbp_review_reports")
    .select("id, title, start_date, end_date, month_label, locations, computed_values, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listReviewReports: ${error.message}`);
  return (data ?? []).map(toAppReport);
}

export async function getReviewReport(id) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gbp_review_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getReviewReport: ${error.message}`);
  return data ? toAppReport(data) : null;
}

export async function saveReviewReport(report) {
  const supabase = createAdminClient();
  await cleanupOldReviewReportsSafely(supabase);

  const id = generateId();
  const { data, error } = await supabase
    .from("gbp_review_reports")
    .insert({
      id,
      title: report.title,
      start_date: report.startDate,
      end_date: report.endDate,
      month_label: report.monthLabel,
      locations: report.locations,
      manual_values: report.manualValues,
      computed_values: report.computedValues,
      created_at: report.createdAt,
    })
    .select("*")
    .single();

  if (error) throw new Error(`saveReviewReport: ${error.message}`);
  return toAppReport(data);
}

export async function updateReviewReportSnapshot(id, report) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gbp_review_reports")
    .update({
      manual_values: report.manualValues,
      computed_values: report.computedValues,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`updateReviewReportSnapshot: ${error.message}`);
  return data ? toAppReport(data) : null;
}

export async function deleteReviewReport(id) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gbp_review_reports")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw new Error(`deleteReviewReport: ${error.message}`);
  return (data ?? []).length > 0;
}
