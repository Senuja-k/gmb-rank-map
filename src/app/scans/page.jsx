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
    <div className="px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2b4a]">Scan History</h1>
          <p className="text-sm text-slate-400 mt-0.5">Geo-grid rank scans across all locations</p>
        </div>
        <Link
          href="/new"
          className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Scan
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-7">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Total Scans</p>
          <p className="text-3xl font-bold text-[#1a2b4a]">{totalScans}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Avg Rank</p>
          <p className={`text-3xl font-bold ${
            parseFloat(overallAvgRank) <= 5 ? "text-emerald-500" :
            parseFloat(overallAvgRank) <= 13 ? "text-amber-500" : "text-red-500"
          }`}>{overallAvgRank}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Avg Top 3%</p>
          <p className={`text-3xl font-bold ${
            parseFloat(overallTop3) >= 50 ? "text-emerald-500" :
            parseFloat(overallTop3) >= 15 ? "text-amber-500" : "text-red-500"
          }`}>{overallTop3}%</p>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 flex-wrap">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or keyword…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl w-64 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-medium">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
            />
            <label className="text-xs text-slate-400 font-medium">To</label>
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
          <span className="ml-auto text-xs text-slate-400">{filtered.length} scan{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm mb-3">No scans found</p>
            <Link href="/new" className="text-sky-500 hover:text-sky-600 text-sm font-medium">
              Create your first scan →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-left">
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Location</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Date</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Keyword</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">Avg Rank</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">Top 3%</th>
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">Grid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((scan) => (
                <tr key={scan.id} className="hover:bg-sky-50/40 transition-colors cursor-pointer group">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/heatmap/${scan.id}`}
                      className="font-semibold text-[#1a2b4a] group-hover:text-sky-600 transition-colors"
                    >
                      {scan.businessName}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">
                    <div className="text-[13px]">{formatDate(scan.createdAt)}</div>
                    <div className="text-[11px] text-slate-400">{timeAgo(scan.createdAt)}</div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{scan.keyword}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={rankBadgeClass(scan.avgRank)}>{scan.avgRank}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={top3BadgeClass(scan.top3Pct)}>{scan.top3Pct}%</span>
                  </td>
                  <td className="px-5 py-3.5 text-center text-slate-500 text-[13px]">
                    {scan.gridSize}×{scan.gridSize}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-400">
            Showing {filtered.length} of {scans.length} scan{scans.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
