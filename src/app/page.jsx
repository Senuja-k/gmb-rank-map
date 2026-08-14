"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const VIEW_METRICS = new Set([
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
]);
const INTERACTION_METRICS = new Set(["WEBSITE_CLICKS", "CALL_CLICKS", "BUSINESS_DIRECTION_REQUESTS"]);
const DEFAULT_CHART_METRIC = "BUSINESS_IMPRESSIONS_MOBILE_SEARCH";
const ALL_CHART_LOCATIONS = "__all__";
const METRIC_LABELS = {
  WEBSITE_CLICKS: "Website Clicks",
  CALL_CLICKS: "Call Clicks",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "Desktop Maps Impressions",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "Desktop Search Impressions",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "Mobile Maps Impressions",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "Mobile Search Impressions",
  BUSINESS_DIRECTION_REQUESTS: "Direction Requests",
};

function formatInputDate(date) {
  return date.toISOString().slice(0, 10);
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  return {
    startDate: formatInputDate(start),
    endDate: formatInputDate(end),
  };
}


function dateParts(date) {
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1),
    day: String(date.getDate()),
  };
}

function sumSeries(row) {
  return (row.timeSeries?.datedValues ?? []).reduce((sum, point) => sum + Number(point.value ?? 0), 0);
}

function dateKeyFromParts(date) {
  const year = String(date.year).padStart(4, "0");
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKeyFromParts(date) {
  const year = String(date.year).padStart(4, "0");
  const month = String(date.month).padStart(2, "0");
  return `${year}-${month}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months, 1);
  return next;
}

function formatBucketLabel(key, bucketMode) {
  if (bucketMode === "day") {
    const date = new Date(`${key}T00:00:00`);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const date = new Date(`${key}-01T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function getInclusiveDayCount(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function buildChartBuckets(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const dayCount = getInclusiveDayCount(startDate, endDate);
  const bucketMode = dayCount <= 31 ? "day" : "month";
  const buckets = [];

  if (bucketMode === "day") {
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      const key = formatInputDate(cursor);
      buckets.push({ key, label: formatBucketLabel(key, bucketMode), value: 0 });
    }
  } else {
    for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = addMonths(cursor, 1)) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ key, label: formatBucketLabel(key, bucketMode), value: 0 });
    }
  }

  return { bucketMode, buckets };
}

function makeChartPath(points) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function buildPerformanceUrl(location, start, end) {
  const from = dateParts(start);
  const to = dateParts(end);
  const params = new URLSearchParams({
    email: location.google_email,
    locationName: location.location_name,
    startYear: from.year,
    startMonth: from.month,
    startDay: from.day,
    endYear: to.year,
    endMonth: to.month,
    endDay: to.day,
  });
  return `/api/gbp/performance?${params.toString()}`;
}

export default function DashboardPage() {
  const [locations, setLocations] = useState([]);
  const [performanceRows, setPerformanceRows] = useState([]);
  const [dateRange, setDateRange] = useState(() => defaultDateRange());
  const [chartMetric, setChartMetric] = useState(DEFAULT_CHART_METRIC);
  const [chartLocation, setChartLocation] = useState(ALL_CHART_LOCATIONS);
  const [loading, setLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setPerformanceError("");

      try {
        const locationsResponse = await fetch("/api/gbp/connect/saved", { cache: "no-store" });
        const locationsJson = locationsResponse.ok ? await locationsResponse.json() : { locations: [] };
        const enabledLocations = (locationsJson.locations ?? []).filter((location) => location.is_enabled);

        const start = new Date(`${dateRange.startDate}T00:00:00`);
        const end = new Date(`${dateRange.endDate}T00:00:00`);

        const performanceResults = await Promise.allSettled(
          enabledLocations.slice(0, 6).map(async (location) => {
            const response = await fetch(buildPerformanceUrl(location, start, end), { cache: "no-store" });
            if (!response.ok) throw new Error(`Performance failed for ${location.display_name || location.location_name}`);
            const json = await response.json();
            return {
              location,
              rows: json.data ?? [],
              searchKeywords: json.searchKeywords ?? [],
            };
          }),
        );

        if (cancelled) return;
        setLocations(enabledLocations);
        setPerformanceRows(performanceResults.filter((result) => result.status === "fulfilled").map((result) => result.value));
        if (performanceResults.some((result) => result.status === "rejected")) {
          setPerformanceError("Some locations did not return performance data.");
        }
      } catch (error) {
        if (!cancelled) {
          setLocations([]);
          setPerformanceRows([]);
          setPerformanceError(error.message || "Dashboard data could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [dateRange.endDate, dateRange.startDate]);

  const performanceMetricTotals = useMemo(() => {
    const totals = new Map();
    for (const location of performanceRows) {
      for (const row of location.rows) {
        totals.set(row.dailyMetric, (totals.get(row.dailyMetric) ?? 0) + sumSeries(row));
      }
    }
    return [...totals.entries()]
      .map(([metric, total]) => ({ metric, total }))
      .sort((a, b) => b.total - a.total);
  }, [performanceRows]);

  const searchKeywordTotals = useMemo(() => {
    const totals = new Map();
    for (const location of performanceRows) {
      for (const row of location.searchKeywords ?? []) {
        const keyword = row.keyword || "Unknown";
        totals.set(keyword, (totals.get(keyword) ?? 0) + Number(row.value || row.threshold || 0));
      }
    }
    return totals;
  }, [performanceRows]);

  const searchKeywordRows = useMemo(
    () =>
      [...searchKeywordTotals.entries()]
        .map(([keyword, value]) => ({ keyword, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [searchKeywordTotals],
  );

  const stats = useMemo(() => {
    const views = performanceMetricTotals
      .filter((row) => VIEW_METRICS.has(row.metric))
      .reduce((sum, row) => sum + row.total, 0);
    const interactions = performanceMetricTotals
      .filter((row) => INTERACTION_METRICS.has(row.metric))
      .reduce((sum, row) => sum + row.total, 0);

    return {
      views,
      interactions,
      activeLocations: locations.length,
      engagementRate: views ? (interactions / views) * 100 : 0,
    };
  }, [locations.length, performanceMetricTotals]);

  const performanceByLocation = useMemo(
    () =>
      performanceRows
        .map((locationData) => {
          const views = locationData.rows
            .filter((row) => VIEW_METRICS.has(row.dailyMetric))
            .reduce((sum, row) => sum + sumSeries(row), 0);
          const interactions = locationData.rows
            .filter((row) => INTERACTION_METRICS.has(row.dailyMetric))
            .reduce((sum, row) => sum + sumSeries(row), 0);
          return {
            name: locationData.location.display_name || locationData.location.location_name,
            views,
            interactions,
          };
        })
        .sort((a, b) => b.views - a.views),
    [performanceRows],
  );

  const availableMetrics = useMemo(() => {
    const metrics = new Set([DEFAULT_CHART_METRIC]);
    for (const location of performanceRows) {
      for (const row of location.rows) {
        metrics.add(row.dailyMetric);
      }
    }
    return [...metrics].sort((a, b) => (METRIC_LABELS[a] ?? a).localeCompare(METRIC_LABELS[b] ?? b));
  }, [performanceRows]);

  const chartLocationOptions = useMemo(
    () =>
      performanceRows.map((locationData) => ({
        value: locationData.location.location_name,
        label: locationData.location.display_name || locationData.location.location_name,
      })),
    [performanceRows],
  );

  const chartData = useMemo(() => {
    const { bucketMode, buckets } = buildChartBuckets(dateRange.startDate, dateRange.endDate);
    const values = new Map(buckets.map((bucket) => [bucket.key, 0]));

    for (const location of performanceRows) {
      if (chartLocation !== ALL_CHART_LOCATIONS && location.location.location_name !== chartLocation) continue;
      for (const row of location.rows) {
        if (row.dailyMetric !== chartMetric) continue;
        for (const point of row.timeSeries?.datedValues ?? []) {
          if (!point.date) continue;
          const key = bucketMode === "day" ? dateKeyFromParts(point.date) : monthKeyFromParts(point.date);
          if (values.has(key)) {
            values.set(key, values.get(key) + Number(point.value ?? 0));
          }
        }
      }
    }

    return {
      bucketMode,
      rows: buckets.map((bucket) => ({ ...bucket, value: values.get(bucket.key) ?? 0 })),
    };
  }, [chartLocation, chartMetric, dateRange.endDate, dateRange.startDate, performanceRows]);

  const chartPoints = useMemo(() => {
    const width = 760;
    const height = 260;
    const padding = { top: 18, right: 24, bottom: 34, left: 48 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(1, ...chartData.rows.map((row) => row.value));
    const yTicks = [...new Set([0, Math.round(maxValue / 2), maxValue])];
    const points = chartData.rows.map((row, index) => {
      const x = padding.left + (chartData.rows.length <= 1 ? innerWidth / 2 : (index / (chartData.rows.length - 1)) * innerWidth);
      const y = padding.top + innerHeight - (row.value / maxValue) * innerHeight;
      return { ...row, x, y };
    });
    const labelStep = Math.max(1, Math.ceil(points.length / 8));

    return {
      width,
      height,
      padding,
      innerWidth,
      innerHeight,
      maxValue,
      points,
      linePath: makeChartPath(points),
      areaPath: points.length
        ? `${makeChartPath(points)} L ${points.at(-1).x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`
        : "",
      labelStep,
      yTicks,
    };
  }, [chartData]);

  const totalSearches = [...searchKeywordTotals.values()].reduce((sum, value) => sum + value, 0);
  const maxLocationViews = Math.max(1, ...performanceByLocation.map((row) => row.views));
  const maxMetricTotal = Math.max(1, ...performanceMetricTotals.map((row) => row.total));
  const chartTotal = chartData.rows.reduce((sum, row) => sum + row.value, 0);
  const chartLocationLabel =
    chartLocation === ALL_CHART_LOCATIONS
      ? "All enabled locations"
      : chartLocationOptions.find((location) => location.value === chartLocation)?.label ?? "Selected location";

  return (
    <div className="px-8 py-8 max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2b4a]">Performance Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Google Business Profile visibility and actions</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            From
            <input
              type="date"
              value={dateRange.startDate}
              max={dateRange.endDate}
              onChange={(event) => setDateRange((current) => ({ ...current, startDate: event.target.value }))}
              className="mt-1 block h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 shadow-sm outline-none focus:border-sky-400"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            To
            <input
              type="date"
              value={dateRange.endDate}
              min={dateRange.startDate}
              max={formatInputDate(new Date())}
              onChange={(event) => setDateRange((current) => ({ ...current, endDate: event.target.value }))}
              className="mt-1 block h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 shadow-sm outline-none focus:border-sky-400"
            />
          </label>
          <Link href="/gbp/reviews" className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            Reviews
          </Link>
          <Link href="/gbp/performance" className="bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            Performance
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 mb-7">
        {[
          { label: "Views", value: stats.views.toLocaleString(), helper: "Selected period" },
          { label: "Interactions", value: stats.interactions.toLocaleString(), helper: "Selected period" },
          { label: "Engagement Rate", value: `${stats.engagementRate.toFixed(1)}%`, helper: "Interactions per view" },
          { label: "Locations", value: stats.activeLocations.toLocaleString(), helper: "Enabled profiles" }
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">{card.label}</p>
            <p className={`text-3xl font-bold ${card.tone ?? "text-[#1a2b4a]"}`}>{card.value}</p>
            <p className="text-xs text-slate-400 mt-2">{card.helper}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-sm text-slate-400">Loading dashboard...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {performanceError ? <div className="xl:col-span-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{performanceError}</div> : null}

          <section className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Metric Trend</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {chartData.bucketMode === "day" ? "Daily" : "Monthly"} values for the dashboard date range
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Location
                  <select
                    value={chartLocation}
                    onChange={(event) => setChartLocation(event.target.value)}
                    className="mt-1 block h-10 min-w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 shadow-sm outline-none focus:border-sky-400"
                  >
                    <option value={ALL_CHART_LOCATIONS}>All enabled locations</option>
                    {chartLocationOptions.map((location) => (
                      <option key={location.value} value={location.value}>
                        {location.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Metric
                  <select
                    value={chartMetric}
                    onChange={(event) => setChartMetric(event.target.value)}
                    className="mt-1 block h-10 min-w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 shadow-sm outline-none focus:border-sky-400"
                  >
                    {availableMetrics.map((metric) => (
                      <option key={metric} value={metric}>
                        {METRIC_LABELS[metric] ?? metric.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Selected Metric</p>
                  <p className="text-lg font-bold text-[#1a2b4a]">{METRIC_LABELS[chartMetric] ?? chartMetric.replaceAll("_", " ")}</p>
                  <p className="text-xs text-slate-400 mt-1">{chartLocationLabel}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Total</p>
                  <p className="text-lg font-bold text-sky-600">{chartTotal.toLocaleString()}</p>
                </div>
              </div>
              {chartData.rows.length ? (
                <div className="overflow-x-auto">
                  <svg viewBox={`0 0 ${chartPoints.width} ${chartPoints.height}`} role="img" aria-label={`${METRIC_LABELS[chartMetric] ?? chartMetric} trend`} className="h-72 min-w-[680px] w-full">
                    <line x1={chartPoints.padding.left} y1={chartPoints.padding.top} x2={chartPoints.padding.left} y2={chartPoints.padding.top + chartPoints.innerHeight} stroke="#e2e8f0" />
                    <line x1={chartPoints.padding.left} y1={chartPoints.padding.top + chartPoints.innerHeight} x2={chartPoints.padding.left + chartPoints.innerWidth} y2={chartPoints.padding.top + chartPoints.innerHeight} stroke="#e2e8f0" />
                    {chartPoints.yTicks.map((value) => {
                      const y = chartPoints.padding.top + chartPoints.innerHeight - (value / chartPoints.maxValue) * chartPoints.innerHeight;
                      return (
                        <g key={value}>
                          <line x1={chartPoints.padding.left} y1={y} x2={chartPoints.padding.left + chartPoints.innerWidth} y2={y} stroke="#f1f5f9" />
                          <text x={chartPoints.padding.left - 10} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-semibold">
                            {value.toLocaleString()}
                          </text>
                        </g>
                      );
                    })}
                    <path d={chartPoints.areaPath} fill="#38bdf8" opacity="0.12" />
                    <path d={chartPoints.linePath} fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    {chartPoints.points.map((point, index) => (
                      <g key={point.key}>
                        <circle cx={point.x} cy={point.y} r="4" fill="#0284c7" stroke="#ffffff" strokeWidth="2">
                          <title>{`${point.label}: ${point.value.toLocaleString()}`}</title>
                        </circle>
                        {index % chartPoints.labelStep === 0 || index === chartPoints.points.length - 1 ? (
                          <text x={point.x} y={chartPoints.padding.top + chartPoints.innerHeight + 22} textAnchor="middle" className="fill-slate-400 text-[10px] font-semibold">
                            {point.label}
                          </text>
                        ) : null}
                      </g>
                    ))}
                  </svg>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-slate-400">No trend data loaded.</div>
              )}
            </div>
          </section>

          <section className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Performance by Location</h2>
              <p className="text-xs text-slate-400 mt-0.5">Views and interactions for the selected period</p>
            </div>
            <div className="p-5 space-y-4">
              {performanceByLocation.length ? (
                performanceByLocation.map((row) => (
                  <div key={row.name}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="font-semibold text-sm text-slate-700 truncate">{row.name}</p>
                      <div className="text-right">
                        <p className="text-xs font-bold text-sky-600">{row.views.toLocaleString()} views</p>
                        <p className="text-[11px] text-slate-400">{row.interactions.toLocaleString()} interactions</p>
                      </div>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(4, (row.views / maxLocationViews) * 100)}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-center text-sm text-slate-400">No performance data loaded.</div>
              )}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Metric Mix</h2>
              <p className="text-xs text-slate-400 mt-0.5">Top GBP performance metrics</p>
            </div>
            <div className="p-5 space-y-4">
              {performanceMetricTotals.length ? (
                performanceMetricTotals.slice(0, 7).map((row) => (
                  <div key={row.metric}>
                    <div className="flex justify-between gap-3 text-sm mb-2">
                      <span className="font-semibold text-slate-700 truncate">{row.metric.replaceAll("_", " ")}</span>
                      <span className="text-slate-400">{row.total.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(4, (row.total / maxMetricTotal) * 100)}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-center text-sm text-slate-400">No metric data loaded.</div>
              )}
            </div>
          </section>

          <section className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Top Queries</h2>
              <p className="text-xs text-slate-400 mt-0.5">{totalSearches.toLocaleString()} keyword impressions in the selected period</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-5">
              {searchKeywordRows.length ? (
                searchKeywordRows.map((row, index) => (
                  <div key={row.keyword} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-white text-sky-600 text-xs font-bold flex items-center justify-center">{index + 1}</span>
                    <p className="font-semibold text-sm text-slate-700 min-w-0 flex-1 truncate">{row.keyword}</p>
                    <span className="text-sm font-bold text-[#1a2b4a]">{row.value.toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <div className="md:col-span-2 py-10 text-center text-sm text-slate-400">No search term data loaded.</div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
