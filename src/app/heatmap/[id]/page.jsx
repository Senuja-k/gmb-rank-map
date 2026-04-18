"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Helpers ─────────────────────────────────────────────────────────────────
function rankBg(rank) {
  if (rank >= 1 && rank <= 3) return "#4caf50";
  if (rank >= 4 && rank <= 10) return "#ff9800";
  if (rank >= 11 && rank <= 20) return "#f44336";
  return "#9e9e9e";
}

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
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Component ───────────────────────────────────────────────────────────────
export default function HeatmapDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();

  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hideColors, setHideColors] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // ── Fetch scan data ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/scans/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setScan(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Scan not found.");
        setLoading(false);
      });
  }, [id]);

  // ── Load Google Maps ──────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.google?.maps) {
      setMapsLoaded(true);
      return;
    }
    if (window.__gmapsLoading) {
      const interval = setInterval(() => {
        if (window.google?.maps) {
          setMapsLoaded(true);
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    window.__gmapsLoading = true;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, []);

  // ── Render map with grid overlay ──────────────────────────────────────────
  useEffect(() => {
    if (!mapsLoaded || !scan || !mapContainerRef.current) return;
    if (!window.google?.maps) return;

    // Create map if needed
    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat: scan.center.lat, lng: scan.center.lng },
        zoom: 12,
        mapId: "rank-heatmap",
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
      });
    }

    // Clear old markers
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    // Add grid markers
    scan.gridPoints.forEach((point) => {
      const bg = hideColors ? "#9e9e9e" : rankBg(point.rank);
      const label = point.rank > 20 ? "20+" : String(point.rank);

      const markerContent = document.createElement("div");
      markerContent.className = "grid-marker";
      markerContent.style.backgroundColor = bg;
      markerContent.textContent = label;

      try {
        const marker = new window.google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current,
          position: { lat: point.lat, lng: point.lng },
          content: markerContent,
          title: `Rank: ${label}`,
        });
        markersRef.current.push(marker);
      } catch {
        // Fallback if AdvancedMarkerElement isn't available
      }
    });

    // Fit bounds
    const bounds = new window.google.maps.LatLngBounds();
    scan.gridPoints.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    mapRef.current.fitBounds(bounds, 40);
  }, [mapsLoaded, scan, hideColors]);

  // ── Delete handler ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this heatmap?")) return;
    await fetch(`/api/scans/${encodeURIComponent(id)}`, { method: "DELETE" });
    router.push("/");
  }, [id, router]);

  // ── Loading / Error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }
  if (error || !scan) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-red-500">{error || "Something went wrong."}</p>
        <Link href="/" className="text-sky-500 hover:underline text-sm">
          Back to Heatmaps
        </Link>
      </div>
    );
  }

  // ── Computed values ───────────────────────────────────────────────────────
  const gridArea = (scan.gridSize * scan.spacingKm) ** 2;
  const betweenPoints = scan.spacingKm * 1000;
  const top3Count = scan.gridPoints.filter((p) => p.rank <= 3).length;

  const competitorsWithPosition = scan.competitors.map((c, i) => ({
    ...c,
    position: i + 1,
  }));

  return (
    <div className="p-6 md:p-8">
      {/* Back button */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-sky-500 hover:text-sky-600 mb-5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        View Heatmap
      </Link>

      {/* Business info bar */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 mb-6">
        <div className="flex flex-wrap gap-8 items-start">
          {/* Business name & info */}
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-lg font-bold text-[#1a2b4a]">
              {scan.businessName}
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
              <a
                href={`https://www.google.com/maps/place/?q=place_id:${scan.placeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-500 hover:underline flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Google Map
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-xs text-slate-400 mb-1">Avg Ranking</p>
              <span className={rankBadgeClass(scan.avgRank)}>{scan.avgRank}</span>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Top 3%</p>
              <span className={top3BadgeClass(scan.top3Pct)}>
                {scan.top3Pct}%
              </span>
            </div>
          </div>

          {/* Keyword info */}
          <div className="text-sm space-y-1">
            <div className="flex gap-2">
              <span className="text-slate-400 w-20">Keyword:</span>
              <span className="font-medium">{scan.keyword}</span>
            </div>
          </div>

          {/* Grid info */}
          <div className="text-sm space-y-1">
            <div className="flex gap-2">
              <span className="text-slate-400">Between Points:</span>
              <span className="font-medium text-sky-600">{betweenPoints} m</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400">Area:</span>
              <span>{gridArea.toFixed(2)} km²</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400">Grid Size:</span>
              <span>
                {scan.gridSize}x{scan.gridSize}{" "}
                <span className="text-slate-400">({scan.totalPoints} Points)</span>
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Main content: competitor table + map */}
      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Competitor table */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden lg:w-[420px] shrink-0">
          <div className="p-3 border-b border-slate-100">
            <input
              type="text"
              placeholder="Search"
              className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-200"
            />
          </div>

          <table className="scan-table w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2 text-center">Avg Rank</th>
                <th className="px-3 py-2 text-center">Position</th>
                <th className="px-3 py-2 text-center">Top 3%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Target business - first row, highlighted */}
              <tr className="bg-sky-50">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#1a2b4a] truncate max-w-[180px]">
                      {scan.businessName}
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] bg-sky-100 text-sky-600 rounded font-semibold">
                      Target
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={rankBadgeClass(scan.avgRank)}>
                    {scan.avgRank}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-slate-500">—</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={top3BadgeClass(scan.top3Pct)}>
                    {scan.top3Pct}%
                  </span>
                </td>
              </tr>

              {/* Competitors */}
              {competitorsWithPosition.slice(0, 20).map((comp) => (
                <tr key={comp.placeId}>
                  <td className="px-3 py-2.5">
                    <span className="truncate max-w-[180px] block text-slate-700">
                      {comp.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={rankBadgeClass(comp.avgRank)}>
                      {comp.avgRank}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-slate-500">
                    {comp.position}{comp.position === 1 ? "st" : comp.position === 2 ? "nd" : comp.position === 3 ? "rd" : "th"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={top3BadgeClass(comp.top3Pct)}>
                      {comp.top3Pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Map + controls */}
        <div className="flex-1 min-w-0">
          {/* Map controls bar */}
          <div className="bg-white rounded-t-lg border border-b-0 border-slate-200 px-4 py-3 flex items-center gap-4 flex-wrap">
            <div className="text-sm">
              <span className="text-slate-400 mr-1.5">Date:</span>
              <span className="font-medium">{formatDate(scan.createdAt)}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-400 mr-1.5">Keywords:</span>
              <span className="font-medium">{scan.keyword}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-slate-500">Hide Colors</span>
              <button
                onClick={() => setHideColors(!hideColors)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  hideColors ? "bg-sky-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    hideColors ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Map */}
          <div
            ref={mapContainerRef}
            className="w-full h-[500px] lg:h-[600px] border border-slate-200 rounded-b-lg bg-slate-100"
          />

          {/* Legend */}
          <div className="flex items-center gap-5 mt-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: "#4caf50" }} />
              Rank 1-3
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: "#ff9800" }} />
              Rank 4-10
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: "#f44336" }} />
              Rank 11-20
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: "#9e9e9e" }} />
              Not ranking
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
            Avg Rank
          </p>
          <p className="text-2xl font-bold text-[#1a2b4a]">{scan.avgRank}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
            Top 3 Points
          </p>
          <p className="text-2xl font-bold text-green-600">
            {top3Count}
            <span className="text-base text-slate-400 font-normal">
              /{scan.totalPoints}
            </span>
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
            Competitors Found
          </p>
          <p className="text-2xl font-bold text-[#1a2b4a]">
            {scan.competitors.length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
            Not Ranking
          </p>
          <p className="text-2xl font-bold text-red-500">
            {scan.gridPoints.filter((p) => p.rank > 20).length}
          </p>
        </div>
      </div>
    </div>
  );
}
