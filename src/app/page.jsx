"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const VIEW_METRICS = new Set([
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
]);
const INTERACTION_METRICS = new Set(["WEBSITE_CLICKS", "CALL_CLICKS", "BUSINESS_DIRECTION_REQUESTS"]);

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

function starCount(rating) {
  return STAR_MAP[rating] ?? 0;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  const [reviews, setReviews] = useState([]);
  const [locations, setLocations] = useState([]);
  const [performanceRows, setPerformanceRows] = useState([]);
  const [dateRange, setDateRange] = useState(() => defaultDateRange());
  const [loading, setLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setPerformanceError("");

      try {
        const [reviewsResponse, locationsResponse] = await Promise.all([
          fetch("/api/gbp/reviews?view=all", { cache: "no-store" }),
          fetch("/api/gbp/connect/saved", { cache: "no-store" }),
        ]);

        const reviewsJson = reviewsResponse.ok ? await reviewsResponse.json() : { reviews: [] };
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

        setReviews(reviewsJson.reviews ?? []);
        setLocations(enabledLocations);
        setPerformanceRows(performanceResults.filter((result) => result.status === "fulfilled").map((result) => result.value));
        if (performanceResults.some((result) => result.status === "rejected")) {
          setPerformanceError("Some locations did not return performance data.");
        }
      } catch (error) {
        if (!cancelled) {
          setReviews([]);
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
    const ratingTotal = reviews.reduce((sum, review) => sum + starCount(review.starRating), 0);
    const answered = reviews.filter((review) => review.reviewReply).length;
    const views = performanceMetricTotals
      .filter((row) => VIEW_METRICS.has(row.metric))
      .reduce((sum, row) => sum + row.total, 0);
    const interactions = performanceMetricTotals
      .filter((row) => INTERACTION_METRICS.has(row.metric))
      .reduce((sum, row) => sum + row.total, 0);

    return {
      totalReviews: reviews.length,
      unansweredReviews: reviews.length - answered,
      replyRate: reviews.length ? (answered / reviews.length) * 100 : 0,
      avgRating: reviews.length ? ratingTotal / reviews.length : 0,
      views,
      interactions,
      activeLocations: locations.length,
      engagementRate: views ? (interactions / views) * 100 : 0,
    };
  }, [locations.length, performanceMetricTotals, reviews]);

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

  const recentReviews = useMemo(
    () =>
      [...reviews]
        .sort((a, b) => new Date(b.createTime ?? 0).getTime() - new Date(a.createTime ?? 0).getTime())
        .slice(0, 6),
    [reviews],
  );

  const totalSearches = [...searchKeywordTotals.values()].reduce((sum, value) => sum + value, 0);
  const maxLocationViews = Math.max(1, ...performanceByLocation.map((row) => row.views));
  const maxMetricTotal = Math.max(1, ...performanceMetricTotals.map((row) => row.total));

  return (
    <div className="px-8 py-8 max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2b4a]">Performance Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Google Business Profile visibility, actions and review health</p>
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
          { label: "Locations", value: stats.activeLocations.toLocaleString(), helper: "Enabled profiles" },
          {
            label: "Avg Rating",
            value: stats.avgRating ? stats.avgRating.toFixed(2) : "0",
            helper: "Review support",
            tone: stats.avgRating >= 4 ? "text-emerald-500" : stats.avgRating >= 3 ? "text-amber-500" : "text-red-500",
          },
          {
            label: "Unanswered",
            value: stats.unansweredReviews.toLocaleString(),
            helper: "Review replies",
            tone: stats.unansweredReviews ? "text-red-500" : "text-emerald-500",
          },
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

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Review Snapshot</h2>
              <p className="text-xs text-slate-400 mt-0.5">Supporting review health</p>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-semibold text-slate-700">Reply rate</span>
                  <span className="text-slate-400">{stats.replyRate.toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.replyRate}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-semibold text-slate-700">Reviews</span>
                  <span className="text-slate-400">{stats.totalReviews}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${stats.totalReviews ? Math.max(8, ((stats.totalReviews - stats.unansweredReviews) / stats.totalReviews) * 100) : 0}%` }}
                  />
                </div>
              </div>
              <Link href="/gbp/reviews" className="block text-xs font-semibold text-sky-500 hover:text-sky-600">
                Open reviews
              </Link>
            </div>
          </section>

          <section className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Recent Reviews</h2>
                <p className="text-xs text-slate-400 mt-0.5">Latest customer feedback, kept secondary to performance</p>
              </div>
              <Link href="/gbp/reviews" className="text-xs font-semibold text-sky-500 hover:text-sky-600">
                View all
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {recentReviews.length ? (
                recentReviews.map((review) => (
                  <div key={review.name ?? `${review.locationName}-${review.createTime}`} className="px-5 py-3.5 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 text-sm font-bold flex items-center justify-center">{starCount(review.starRating)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-700 truncate">{review.reviewer?.displayName ?? "Customer"}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {review.locationDisplayName} - {formatDate(review.createTime)}
                      </p>
                    </div>
                    <span className={`text-xs font-bold rounded-full px-2 py-1 ${review.reviewReply ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                      {review.reviewReply ? "Replied" : "Open"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="md:col-span-2 xl:col-span-3 px-5 py-10 text-center text-sm text-slate-400">No reviews loaded.</div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
