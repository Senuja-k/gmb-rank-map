import { createAdminClient } from "./supabase-server";
import { generateId } from "./storage";

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

export async function listReviewReports() {
  const supabase = createAdminClient();
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
