"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function rankBadgeClass(rank) {
  if (rank <= 5) return "rank-badge rank-green";
  if (rank <= 13) return "rank-badge rank-orange";
  return "rank-badge rank-red";
}

function top3BadgeClass(pct) {
  if (pct >= 50) return "rank-badge rank-green";
  if (pct >= 15) return "rank-badge rank-orange";
  return "rank-badge rank-red";
}

function formatDate(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} ${time}`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} months ago`;
}

export default function HeatmapsListPage() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    fetch("/api/scans")
      .then((r) => r.json())
      .then((data) => {
        setScans(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = scans.filter((s) => {
    const matchesSearch =
      s.businessName.toLowerCase().includes(search.toLowerCase()) ||
      s.keyword.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (new Date(s.createdAt) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(s.createdAt) > to) return false;
    }
    return true;
  });

  const totalScans = filtered.length;
  const overallAvgRank =
    totalScans > 0
      ? (filtered.reduce((s, r) => s + r.avgRank, 0) / totalScans).toFixed(2)
      : "0";
  const overallTop3 =
    totalScans > 0
      ? (filtered.reduce((s, r) => s + r.top3Pct, 0) / totalScans).toFixed(2)
      : "0";

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1a2b4a]">Heatmaps</h1>

        {/* Tabs */}
        <div className="flex mt-4 border-b border-slate-200">
          <button className="px-5 py-2.5 text-sm font-medium text-white bg-[#1a2b4a] rounded-t-lg -mb-px">
            All Heatmaps
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <span className="text-sm font-medium text-slate-500 flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filter
        </span>
        <span className={rankBadgeClass(parseFloat(overallAvgRank))}>
          Average Rank {overallAvgRank}
        </span>
        <span className={top3BadgeClass(parseFloat(overallTop3))}>
          Top 3% {overallTop3}%
        </span>
        <span className="rank-badge bg-sky-500">
          Total Scans {totalScans}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
          />
          <label className="text-xs text-slate-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Search + Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
            />
          </div>
          <Link
            href="/new"
            className="px-4 py-2 text-sm font-medium text-white bg-sky-500 rounded-lg hover:bg-sky-600 transition-colors"
          >
            + New Scan
          </Link>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-slate-400 mb-2">No heatmaps yet</div>
            <Link
              href="/new"
              className="text-sky-500 hover:text-sky-600 text-sm font-medium"
            >
              Create your first scan
            </Link>
          </div>
        ) : (
          <table className="scan-table w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Location Name</th>
                <th className="px-4 py-3">Created Date</th>
                <th className="px-4 py-3">Keyword</th>
                <th className="px-4 py-3 text-center">Avg Rank</th>
                <th className="px-4 py-3 text-center">Top 3%</th>
                <th className="px-4 py-3 text-center">Grid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((scan) => (
                <tr key={scan.id} className="cursor-pointer">
                  <td className="px-4 py-3">
                    <Link
                      href={`/heatmap/${scan.id}`}
                      className="font-medium text-sky-600 hover:text-sky-700 hover:underline"
                    >
                      {scan.businessName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    <div>{formatDate(scan.createdAt)}</div>
                    <div className="text-xs text-slate-400">
                      {timeAgo(scan.createdAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{scan.keyword}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={rankBadgeClass(scan.avgRank)}>
                      {scan.avgRank}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={top3BadgeClass(scan.top3Pct)}>
                      {scan.top3Pct}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">
                    {scan.gridSize}x{scan.gridSize}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-400">
            Showing 1 to {filtered.length} of {filtered.length} entries
          </div>
        )}
      </div>
    </div>
  );
}
