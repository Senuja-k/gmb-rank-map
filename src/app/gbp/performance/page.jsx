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

function sumTimeSeries(timeSeries) {
  if (!timeSeries?.length) return 0;
  return timeSeries.reduce((acc, pt) => acc + (pt.value ?? 0), 0);
}

export default function PerformancePage() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [startYear, setStartYear] = useState("2026");
  const [startMonth, setStartMonth] = useState("1");
  const [startDay, setStartDay] = useState("1");
  const [endYear, setEndYear] = useState("2026");
  const [endMonth, setEndMonth] = useState(String(new Date().getMonth() + 1));
  const [endDay, setEndDay] = useState(String(new Date().getDate()));

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  async function handleFetch(e) {
    e.preventDefault();
    setLoading(true);
    setRows(null);
    setError("");

    const params = new URLSearchParams({
      email: selectedLocation?.email ?? "",
      locationName: selectedLocation?.locationName ?? "",
      startYear,
      startMonth,
      startDay,
      endYear,
      endMonth,
      endDay,
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
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1a2b4a]">Performance Analytics</h1>
        <p className="text-sm text-slate-500 mt-1">
          Fetch website clicks, calls, impressions and direction requests from the Business Profile Performance API.
        </p>
      </div>

      {/* Filter form */}
      <form onSubmit={handleFetch} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 mb-8">
        <LocationPicker value={selectedLocation} onChange={setSelectedLocation} />

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
            <div className="flex gap-2">
              <input
                type="number" placeholder="YYYY" value={startYear}
                onChange={(e) => setStartYear(e.target.value)}
                className="w-24 border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <input
                type="number" placeholder="MM" min="1" max="12" value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="w-16 border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <input
                type="number" placeholder="DD" min="1" max="31" value={startDay}
                onChange={(e) => setStartDay(e.target.value)}
                className="w-16 border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
            <div className="flex gap-2">
              <input
                type="number" placeholder="YYYY" value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
                className="w-24 border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <input
                type="number" placeholder="MM" min="1" max="12" value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="w-16 border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <input
                type="number" placeholder="DD" min="1" max="31" value={endDay}
                onChange={(e) => setEndDay(e.target.value)}
                className="w-16 border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? "Fetching…" : "Fetch Performance Data"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
          <p className="text-sm font-medium text-red-700">Error</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      )}

      {/* Results table */}
      {rows && summaryRows.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-10">No data returned for this date range.</p>
      )}

      {summaryRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Summary — Totals for Period</h2>
          </div>
          <table className="w-full scan-table text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Metric</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaryRows.map((row) => (
                <tr key={row.metric}>
                  <td className="px-5 py-3 text-slate-700">{row.label}</td>
                  <td className="px-5 py-3 text-right font-semibold text-[#1a2b4a]">
                    {row.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Daily breakdown (expandable per metric) */}
      {summaryRows.length > 0 && (
        <div className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Daily Breakdown</h2>
          {summaryRows.map((row) => (
            <details key={row.metric} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <summary className="px-5 py-3 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-50 flex justify-between items-center">
                <span>{row.label}</span>
                <span className="text-sky-600 font-semibold">{row.total.toLocaleString()}</span>
              </summary>
              <div className="border-t border-slate-100 max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-5 py-2 text-left text-slate-500 font-semibold">Date</th>
                      <th className="px-5 py-2 text-right text-slate-500 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {row.series.map((pt, i) => {
                      const d = pt.date;
                      const dateStr = d
                        ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
                        : `Day ${i + 1}`;
                      return (
                        <tr key={i}>
                          <td className="px-5 py-1.5 text-slate-600">{dateStr}</td>
                          <td className="px-5 py-1.5 text-right font-medium text-slate-800">
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
      )}
    </div>
  );
}
