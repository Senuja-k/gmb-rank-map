"use client";

import { useState } from "react";
import LocationPicker from "@/components/LocationPicker";

const METRICS_LABELS = {
  WEBSITE_CLICKS: "Website Clicks",
  CALL_CLICKS: "Call Clicks",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "Desktop Maps Views",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "Desktop Search Views",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "Mobile Maps Views",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "Mobile Search Views",
  BUSINESS_DIRECTION_REQUESTS: "Direction Requests",
};

const METRIC_STYLES = {
  WEBSITE_CLICKS: { icon: "globe", tone: "bg-emerald-50 text-emerald-700 ring-emerald-100", bar: "bg-emerald-500" },
  CALL_CLICKS: { icon: "phone", tone: "bg-rose-50 text-rose-700 ring-rose-100", bar: "bg-rose-500" },
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: { icon: "map", tone: "bg-indigo-50 text-indigo-700 ring-indigo-100", bar: "bg-indigo-500" },
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: { icon: "search", tone: "bg-sky-50 text-sky-700 ring-sky-100", bar: "bg-sky-500" },
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: { icon: "mapPin", tone: "bg-violet-50 text-violet-700 ring-violet-100", bar: "bg-violet-500" },
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: { icon: "smartphone", tone: "bg-blue-50 text-blue-700 ring-blue-100", bar: "bg-blue-500" },
  BUSINESS_DIRECTION_REQUESTS: { icon: "navigation", tone: "bg-amber-50 text-amber-700 ring-amber-100", bar: "bg-amber-500" },
};

function MetricIcon({ name }) {
  const common = {
    className: "h-4 w-4",
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (name === "phone") {
    return <svg {...common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.66 2.8a2 2 0 0 1-.45 2.11L8.05 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.31 1.84.53 2.8.66A2 2 0 0 1 22 16.92Z" /></svg>;
  }
  if (name === "map") {
    return <svg {...common}><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15" /><path d="M15 6v15" /></svg>;
  }
  if (name === "search") {
    return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  }
  if (name === "mapPin") {
    return <svg {...common}><path d="M12 21s7-4.4 7-11a7 7 0 1 0-14 0c0 6.6 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
  }
  if (name === "smartphone") {
    return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>;
  }
  if (name === "navigation") {
    return <svg {...common}><path d="m12 2 7 19-7-4-7 4 7-19Z" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></svg>;
}

function sumTimeSeries(timeSeries) {
  if (!timeSeries?.length) return 0;
  return timeSeries.reduce((acc, pt) => acc + (pt.value ?? 0), 0);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfYearStr() {
  return `${new Date().getFullYear()}-01-01`;
}

function summarizePerformanceRows(rows) {
  return rows
    ? rows.map((series) => {
        const metric = series.dailyMetric;
        const total = sumTimeSeries(series.timeSeries?.datedValues);
        const label = METRICS_LABELS[metric] ?? metric;
        return { metric, label, total, series: series.timeSeries?.datedValues ?? [] };
      })
    : [];
}

function percentChange(current, previous) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

function formatChangePercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "New";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

async function fetchPerformancePayload(selectedLocation, startDate, endDate) {
  const [startYear, startMonth, startDay] = startDate.split("-");
  const [endYear, endMonth, endDay] = endDate.split("-");

  const params = new URLSearchParams({
    email: selectedLocation?.email ?? "",
    locationName: selectedLocation?.locationName ?? "",
    startYear,
    startMonth: String(parseInt(startMonth, 10)),
    startDay: String(parseInt(startDay, 10)),
    endYear,
    endMonth: String(parseInt(endMonth, 10)),
    endDay: String(parseInt(endDay, 10)),
  });

  const res = await fetch(`/api/gbp/performance?${params}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Unknown error");
  return { rows: json.data ?? [], searchKeywords: json.searchKeywords ?? [] };
}

export default function PerformancePage() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [startDate, setStartDate] = useState(firstOfYearStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareStartDate, setCompareStartDate] = useState(firstOfYearStr());
  const [compareEndDate, setCompareEndDate] = useState(todayStr());

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(null);
  const [compareRows, setCompareRows] = useState(null);
  const [searchKeywords, setSearchKeywords] = useState(null);
  const [error, setError] = useState("");

  async function handleFetch(e) {
    e.preventDefault();
    setLoading(true);
    setRows(null);
    setCompareRows(null);
    setSearchKeywords(null);
    setError("");

    try {
      const [periodPayload, periodComparePayload] = compareEnabled
        ? await Promise.all([
            fetchPerformancePayload(selectedLocation, startDate, endDate),
            fetchPerformancePayload(selectedLocation, compareStartDate, compareEndDate),
          ])
        : [await fetchPerformancePayload(selectedLocation, startDate, endDate), null];
      setRows(periodPayload.rows);
      setSearchKeywords(periodPayload.searchKeywords);
      setCompareRows(periodComparePayload?.rows ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Build summary table: one row per metric
  const summaryRows = summarizePerformanceRows(rows);
  const compareSummaryRows = summarizePerformanceRows(compareRows);
  const compareByMetric = new Map(compareSummaryRows.map((row) => [row.metric, row]));
  const comparisonRows = summaryRows.map((row) => {
    const compare = compareByMetric.get(row.metric);
    const compareTotal = compare?.total ?? 0;
    const delta = row.total - compareTotal;
    return { ...row, compareTotal, delta, changePercent: percentChange(row.total, compareTotal) };
  });
  const viewMetrics = new Set([
    "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
    "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
    "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
    "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  ]);
  const interactionMetrics = new Set(["WEBSITE_CLICKS", "CALL_CLICKS", "BUSINESS_DIRECTION_REQUESTS"]);
  const totalViews = summaryRows
    .filter((row) => viewMetrics.has(row.metric))
    .reduce((sum, row) => sum + row.total, 0);
  const totalInteractions = summaryRows
    .filter((row) => interactionMetrics.has(row.metric))
    .reduce((sum, row) => sum + row.total, 0);
  const totalTrackedActivity = totalViews + totalInteractions;
  const topMetric = [...summaryRows].sort((a, b) => b.total - a.total)[0];
  const totalSearches = (searchKeywords ?? []).reduce((sum, row) => sum + (row.value || row.threshold || 0), 0);

  return (
    <div className="px-8 py-8 max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2b4a]">Performance Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Business Profile views and customer actions by location and date range.
          </p>
        </div>
        {summaryRows.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total tracked activity</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{totalTrackedActivity.toLocaleString()}</p>
          </div>
        )}
      </div>

      <form onSubmit={handleFetch} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-5 mb-7">
        <LocationPicker value={selectedLocation} onChange={setSelectedLocation} />

        <div className={`grid gap-4 ${compareEnabled ? "xl:grid-cols-2" : ""}`}>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{compareEnabled ? "Period 1" : "Date Range"}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                />
              </div>
            </div>
          </div>
          {compareEnabled && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Period 2</p>
              <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={compareStartDate}
                  onChange={(e) => setCompareStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">End Date</label>
                <input
                  type="date"
                  value={compareEndDate}
                  onChange={(e) => setCompareEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                />
              </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={compareEnabled}
                onChange={(e) => {
                  setCompareEnabled(e.target.checked);
                  if (!e.target.checked) setCompareRows(null);
                }}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
              />
              Compare with another period
            </label>
            <p className="text-xs text-slate-400">
              {selectedLocation ? "Ready to fetch selected profile metrics." : "Choose a profile to fetch metrics."}
            </p>
          </div>
          <button
            type="submit"
            disabled={loading || !selectedLocation}
            className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? "Fetching..." : compareEnabled ? "Compare Performance" : "Fetch Performance Data"}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-6">
          <p className="text-sm font-semibold text-red-700">Error</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      )}

      {rows && summaryRows.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 text-center">
          <p className="text-slate-400 text-sm">No data returned for this date range.</p>
        </div>
      )}

      {summaryRows.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <MetricIcon name="globe" />
                </span>
                <span className="text-xs font-semibold text-slate-400">Search + Maps</span>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Views</p>
              <p className="mt-1 text-3xl font-bold text-slate-950">{totalViews.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
                  <MetricIcon name="navigation" />
                </span>
                <span className="text-xs font-semibold text-slate-400">Actions</span>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Interactions</p>
              <p className="mt-1 text-3xl font-bold text-slate-950">{totalInteractions.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-7">
            {summaryRows.map((row) => {
              const style = METRIC_STYLES[row.metric] ?? { icon: "globe", tone: "bg-slate-50 text-slate-700 ring-slate-100", bar: "bg-slate-500" };
              const share = totalTrackedActivity ? Math.round((row.total / totalTrackedActivity) * 100) : 0;
              return (
                <div key={row.metric} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${style.tone}`}>
                      <MetricIcon name={style.icon} />
                    </span>
                  </div>
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{row.label}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">{row.total.toLocaleString()}</p>
                  <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.max(4, share)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {searchKeywords && (
            <div className="mb-7 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800">Searches Breakdown</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Search terms that showed your Business Profile in Search or Maps.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Searches</p>
                    <p className="text-2xl font-bold text-slate-950">{totalSearches.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              {searchKeywords.length > 0 ? (
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {searchKeywords.map((row, index) => {
                    const displayValue = row.value || row.threshold || 0;
                    return (
                      <div key={`${row.keyword}-${index}`} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50/70">
                        <span className="text-slate-400 font-semibold">{index + 1}.</span>
                        <span className="font-semibold text-slate-700">{row.keyword}</span>
                        <span className="font-bold text-slate-900">
                          {row.value ? displayValue.toLocaleString() : `< ${displayValue.toLocaleString()}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-10 text-center text-sm text-slate-400">No search terms returned for this monthly range.</div>
              )}
            </div>
          )}
          {compareEnabled && compareRows && (
            <div className="mb-7 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-800">Period Comparison</h2>
                <p className="text-xs text-slate-400 mt-0.5">Period 1 is compared against Period 2.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-5 py-3 text-left font-semibold">Metric</th>
                      <th className="px-5 py-3 text-right font-semibold">Period 1</th>
                      <th className="px-5 py-3 text-right font-semibold">Period 2</th>
                      <th className="px-5 py-3 text-right font-semibold">Change</th>
                      <th className="px-5 py-3 text-right font-semibold">Change %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {comparisonRows.map((row) => {
                      const style = METRIC_STYLES[row.metric] ?? { icon: "globe", tone: "bg-slate-50 text-slate-700 ring-slate-100" };
                      const positive = row.delta > 0;
                      const negative = row.delta < 0;
                      return (
                        <tr key={row.metric} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3 font-semibold text-slate-700">
                            <span className="flex items-center gap-2">
                              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ring-1 ${style.tone}`}>
                                <MetricIcon name={style.icon} />
                              </span>
                              {row.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-900">{row.total.toLocaleString()}</td>
                          <td className="px-5 py-3 text-right text-slate-500">{row.compareTotal.toLocaleString()}</td>
                          <td className={`px-5 py-3 text-right font-semibold ${positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-slate-500"}`}>
                            {row.delta > 0 ? "+" : ""}{row.delta.toLocaleString()}
                          </td>
                          <td className={`px-5 py-3 text-right font-semibold ${positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-slate-500"}`}>
                            {formatChangePercent(row.changePercent)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Daily Breakdown</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {topMetric ? `Top metric: ${topMetric.label} (${topMetric.total.toLocaleString()})` : "Expanded daily values by metric."}
                </p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {summaryRows.map((row) => {
                const style = METRIC_STYLES[row.metric] ?? { icon: "globe", tone: "bg-slate-50 text-slate-700 ring-slate-100" };
                return (
                  <details key={row.metric} className="group">
                    <summary className="px-5 py-3.5 cursor-pointer text-sm font-semibold text-slate-700 hover:bg-slate-50/80 transition-colors flex justify-between items-center">
                      <span className="flex items-center gap-2">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ring-1 ${style.tone}`}>
                          <MetricIcon name={style.icon} />
                        </span>
                        {row.label}
                      </span>
                      <span className="text-sky-600 font-bold">{row.total.toLocaleString()}</span>
                    </summary>
                    <div className="border-t border-slate-100 max-h-64 overflow-y-auto bg-slate-50/40">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 sticky top-0">
                            <th className="px-5 py-2 text-left text-slate-400 font-semibold uppercase tracking-wider">Date</th>
                            <th className="px-5 py-2 text-right text-slate-400 font-semibold uppercase tracking-wider">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {row.series.map((pt, i) => {
                            const d = pt.date;
                            const dateStr = d
                              ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
                              : `Day ${i + 1}`;
                            return (
                              <tr key={i} className="hover:bg-white">
                                <td className="px-5 py-1.5 text-slate-500">{dateStr}</td>
                                <td className="px-5 py-1.5 text-right font-semibold text-slate-700">
                                  {(pt.value ?? 0).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}






