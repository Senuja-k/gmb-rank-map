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

const METRICS_ICONS = {
  WEBSITE_CLICKS: "🌐",
  CALL_CLICKS: "📞",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "🗺️",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "🔍",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "📱",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "📲",
  BUSINESS_DIRECTION_REQUESTS: "🧭",
};

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

export default function PerformancePage() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [startDate, setStartDate] = useState(firstOfYearStr());
  const [endDate, setEndDate] = useState(todayStr());

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  async function handleFetch(e) {
    e.preventDefault();
    setLoading(true);
    setRows(null);
    setError("");

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

    try {
      const res = await fetch(`/api/gbp/performance?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Unknown error");
      setRows(json.data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Build summary table: one row per metric
  const summaryRows = rows
    ? rows.map((series) => {
        const metric = series.dailyMetric;
        const total = sumTimeSeries(series.timeSeries?.datedValues);
        const label = METRICS_LABELS[metric] ?? metric;
        return { metric, label, total, series: series.timeSeries?.datedValues ?? [] };
      })
    : [];

  return (
    <div className="px-8 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-[#1a2b4a]">Performance Analytics</h1>
        <p className="text-sm text-slate-400 mt-1">
          Website clicks, calls, impressions and direction requests from the Business Profile Performance API.
        </p>
      </div>

      {/* Filter form */}
      <form onSubmit={handleFetch} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5 mb-7">
        <LocationPicker value={selectedLocation} onChange={setSelectedLocation} />

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !selectedLocation}
          className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
        >
          {loading ? "Fetching…" : "Fetch Performance Data"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl mb-6">
          <p className="text-sm font-semibold text-red-700">Error</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      )}

      {/* No data */}
      {rows && summaryRows.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center">
          <p className="text-slate-400 text-sm">No data returned for this date range.</p>
        </div>
      )}

      {/* Summary metric cards */}
      {summaryRows.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-7">
            {summaryRows.map((row) => (
              <div key={row.metric} className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
                <p className="text-lg mb-1">{METRICS_ICONS[row.metric] ?? "📊"}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{row.label}</p>
                <p className="text-2xl font-bold text-[#1a2b4a]">{row.total.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Daily breakdown (expandable per metric) */}
          <div className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Daily Breakdown</h2>
            {summaryRows.map((row) => (
              <details key={row.metric} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <summary className="px-5 py-3.5 cursor-pointer text-sm font-semibold text-slate-700 hover:bg-slate-50/80 transition-colors flex justify-between items-center">
                  <span className="flex items-center gap-2">
                    <span>{METRICS_ICONS[row.metric] ?? "📊"}</span>
                    {row.label}
                  </span>
                  <span className="text-sky-600 font-bold">{row.total.toLocaleString()}</span>
                </summary>
                <div className="border-t border-slate-100 max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 sticky top-0">
                        <th className="px-5 py-2 text-left text-slate-400 font-semibold uppercase tracking-wider">Date</th>
                        <th className="px-5 py-2 text-right text-slate-400 font-semibold uppercase tracking-wider">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {row.series.map((pt, i) => {
                        const d = pt.date;
                        const dateStr = d
                          ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
                          : `Day ${i + 1}`;
                        return (
                          <tr key={i} className="hover:bg-slate-50/50">
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
            ))}
          </div>
        </>
      )}
    </div>
  );
}
