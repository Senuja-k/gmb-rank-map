"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Helpers
function rankBg(rank, status = "ok") {
  if (status === "api_error") return "#7c2d12";
  if (status === "zero_results") return "#6b7280";
  if (rank >= 1 && rank <= 3) return "#4caf50";
  if (rank >= 4 && rank <= 10) return "#ff9800";
  if (rank >= 11 && rank <= 20) return "#f44336";
  return "#9e9e9e";
}

function rankBadgeClass(rank) {
  if (typeof rank !== "number") return "rank-badge rank-red";
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

function businessKey(business) {
  return business?.placeId || business?.name || "";
}

function findPointBusinessRank(point, activeBusinessKey) {
  if (!activeBusinessKey) return point.rank;
  const match = (point.competitors || []).find((comp) => businessKey(comp) === activeBusinessKey);
  return match?.rank ?? 21;
}

function formatRank(rank) {
  if (typeof rank !== "number") return "-";
  return rank > 20 ? "20+" : rank;
}

function pointStatus(point) {
  return point?.status || "ok";
}

function formatPointLabel(point, rank) {
  const status = pointStatus(point);
  if (status === "api_error") return "ERR";
  if (status === "zero_results") return "0";
  return String(formatRank(rank));
}

function formatPointStatus(point, rank) {
  const status = pointStatus(point);
  if (status === "api_error") return `API Error${point.httpStatus ? ` ${point.httpStatus}` : ""}`;
  if (status === "zero_results") return "Zero Results";
  return rank > 20 ? "Not Ranking" : "Ranking";
}
function buildCompetitorSummaries(gridPoints, targetPlaceId) {
  const map = new Map();
  for (const point of gridPoints) {
    for (const comp of point.competitors || []) {
      if (comp.placeId === targetPlaceId || comp.isTarget) continue;
      const key = businessKey(comp);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          placeId: comp.placeId,
          name: comp.name,
          ranks: [],
          top3: 0,
          lat: comp.lat,
          lng: comp.lng,
        });
      }
      const entry = map.get(key);
      entry.ranks.push(comp.rank);
      if (comp.rank <= 3) entry.top3++;
    }
  }

  const totalPoints = gridPoints.length || 1;
  return Array.from(map.entries())
    .map(([key, data]) => {
      const missingPoints = totalPoints - data.ranks.length;
      const rankTotal = data.ranks.reduce((s, r) => s + r, 0) + missingPoints * 21;
      const avgRank = rankTotal / totalPoints;
      return {
        key,
        placeId: data.placeId,
        name: data.name,
        avgRank: parseFloat(avgRank.toFixed(2)),
        bestRank: Math.min(...data.ranks),
        top3Pct: parseFloat(((data.top3 / totalPoints) * 100).toFixed(2)),
        appearances: data.ranks.length,
        lat: data.lat,
        lng: data.lng,
      };
    })
    .sort((a, b) => a.avgRank - b.avgRank || b.appearances - a.appearances || a.bestRank - b.bestRank);
}

export default function HeatmapDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();

  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hideColors, setHideColors] = useState(false);
  const [selectedPointIndex, setSelectedPointIndex] = useState(null);
  const [selectedBusinessKey, setSelectedBusinessKey] = useState("");

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapsLoaded, setMapsLoaded] = useState(() => typeof window !== "undefined" && Boolean(window.google?.maps));

  // Fetch scan data
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

  // Load Google Maps
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mapsLoaded) return;
    if (window.google?.maps) {
      queueMicrotask(() => setMapsLoaded(true));
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
  }, [mapsLoaded]);

  // Render map with grid overlay
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
    scan.gridPoints.forEach((point, pointIndex) => {
      const rank = findPointBusinessRank(point, selectedBusinessKey);
      const status = pointStatus(point);
      const bg = hideColors ? "#9e9e9e" : rankBg(rank, status);
      const label = formatPointLabel(point, rank);
      const isSelected = selectedPointIndex === pointIndex;

      const markerContent = document.createElement("div");
      markerContent.className = "grid-marker";
      markerContent.style.backgroundColor = bg;
      markerContent.style.cursor = "pointer";
      markerContent.style.boxShadow = isSelected
        ? "0 0 0 3px #0ea5e9, 0 8px 18px rgba(14, 165, 233, 0.35)"
        : "";
      markerContent.style.transform = isSelected ? "scale(1.12)" : "";
      markerContent.textContent = label;
      markerContent.title = `Point ${pointIndex + 1}: ${formatPointStatus(point, rank)}`;
      markerContent.addEventListener("click", () => setSelectedPointIndex(pointIndex));

      try {
        const marker = new window.google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current,
          position: { lat: point.lat, lng: point.lng },
          content: markerContent,
          title: `Point ${pointIndex + 1}: ${formatPointStatus(point, rank)}`,
          zIndex: isSelected ? 200 : 1,
        });
        marker.addListener?.("click", () => setSelectedPointIndex(pointIndex));
        markersRef.current.push(marker);
      } catch {
        // Fallback if AdvancedMarkerElement isn't available
      }
    });

    // Fit bounds
    const bounds = new window.google.maps.LatLngBounds();
    scan.gridPoints.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    if (!mapRef.current.__boundsFit) {
      mapRef.current.fitBounds(bounds, 40);
      mapRef.current.__boundsFit = true;
    }
  }, [mapsLoaded, scan, hideColors, selectedPointIndex, selectedBusinessKey]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this heatmap?")) return;
    await fetch(`/api/scans/${encodeURIComponent(id)}`, { method: "DELETE" });
    router.push("/");
  }, [id, router]);

  // Loading / Error states
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

  // Computed values
  const gridArea = (scan.gridSize * scan.spacingKm) ** 2;
  const betweenPoints = scan.spacingKm * 1000;
  const displayCompetitors = buildCompetitorSummaries(scan.gridPoints.filter((point) => pointStatus(point) === "ok"), scan.placeId);
  const activeBusiness = selectedBusinessKey
    ? displayCompetitors.find((comp) => businessKey(comp) === selectedBusinessKey)
    : null;
  const activeBusinessName = activeBusiness?.name || scan.businessName;
  const activePlaceId = activeBusiness?.placeId || scan.placeId;
  const validPoints = scan.gridPoints.filter((point) => pointStatus(point) === "ok");
  const activePointRanks = validPoints.map((point) => findPointBusinessRank(point, selectedBusinessKey));
  const top3Count = activePointRanks.filter((rank) => rank <= 3).length;
  const notRankingCount = activePointRanks.filter((rank) => rank > 20).length;
  const failedPointCount = scan.gridPoints.filter((point) => pointStatus(point) === "api_error").length;
  const zeroResultCount = scan.gridPoints.filter((point) => pointStatus(point) === "zero_results").length;
  const selectedPoint = selectedPointIndex === null ? null : scan.gridPoints[selectedPointIndex];
  const selectedPointRank = selectedPoint ? findPointBusinessRank(selectedPoint, selectedBusinessKey) : null;
  const selectedPointCompetitors = selectedPoint?.competitors ?? [];
  const selectedPointTop3 = selectedPointRank !== null && selectedPointRank <= 3;
  const selectedPointStatus = selectedPoint ? formatPointStatus(selectedPoint, selectedPointRank) : null;

  const competitorsWithPosition = displayCompetitors.map((c, i) => ({
    ...c,
    position: i + 1,
  }));
  const tableCompetitors = selectedPoint
    ? selectedPointCompetitors.map((c) => ({ ...c, position: c.rank }))
    : competitorsWithPosition;
  const displayRank = selectedPoint ? selectedPointRank : (activeBusiness?.avgRank ?? scan.avgRank);
  const displayTop3Pct = selectedPoint ? (selectedPointTop3 ? 100 : 0) : (activeBusiness?.top3Pct ?? scan.top3Pct);
  const targetDisplayRank = selectedBusinessKey
    ? selectedPoint
      ? selectedPoint.rank
      : scan.avgRank
    : displayRank;
  const targetDisplayTop3Pct = selectedBusinessKey
    ? selectedPoint
      ? (selectedPoint.rank <= 3 ? 100 : 0)
      : scan.top3Pct
    : displayTop3Pct;
  const showTargetRankMap = () => {
    setSelectedBusinessKey("");
    setSelectedPointIndex(null);
  };
  const showBusinessRankMap = (business) => {
    const key = businessKey(business);
    if (!key) return;
    setSelectedBusinessKey(key);
    setSelectedPointIndex(null);
  };

  return (
    <div className="px-8 py-8">
      {/* Back button */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-sky-500 mb-5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All Scans
      </Link>

      {/* Business info bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
        <div className="flex flex-wrap gap-8 items-start">
          {/* Business name & info */}
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-xl font-bold text-[#1a2b4a]">
              {activeBusinessName}
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
              <a
                href={`https://www.google.com/maps/place/?q=place_id:${activePlaceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-500 hover:text-sky-600 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                View on Google Maps
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-xs text-slate-400 mb-1">{selectedPoint ? "Point Ranking" : "Avg Ranking"}</p>
              <span className={rankBadgeClass(displayRank)}>{selectedPoint && pointStatus(selectedPoint) !== "ok" ? formatPointLabel(selectedPoint, displayRank) : formatRank(displayRank)}</span>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">{selectedPoint ? "Point Top 3" : "Top 3%"}</p>
              <span className={top3BadgeClass(displayTop3Pct)}>
                {selectedPoint && pointStatus(selectedPoint) !== "ok" ? "-" : selectedPoint ? (selectedPointTop3 ? "Yes" : "No") : `${displayTop3Pct}%`}
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
              <span>{gridArea.toFixed(2)} km2</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400">Grid Size:</span>
              <span>
                {scan.gridSize}x{scan.gridSize}{" "}
                <span className="text-slate-400">({scan.totalPoints} Points)</span>
              </span>
            </div>
            {selectedPoint && (
              <div className="flex gap-2">
                <span className="text-slate-400">Selected:</span>
                <span className="font-medium text-sky-600">Point {selectedPointIndex + 1}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Main content: competitor table + map */}
      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Competitor table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-auto lg:w-[420px] shrink-0 max-h-[calc(100vh-200px)]">
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
                <th className="px-3 py-2 text-center">{selectedPoint ? "Rank" : "Avg Rank"}</th>
                <th className="px-3 py-2 text-center">Position</th>
                <th className="px-3 py-2 text-center">{selectedPoint ? "Top 3" : "Top 3%"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Target business - first row, highlighted */}
              <tr className={selectedBusinessKey ? "bg-white hover:bg-slate-50" : "bg-sky-50"}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={showTargetRankMap}
                      className="font-medium text-left text-[#1a2b4a] truncate max-w-[180px] hover:text-sky-600"
                      title="Show target rank map"
                    >
                      {scan.businessName}
                    </button>
                    <span className="px-1.5 py-0.5 text-[10px] bg-sky-100 text-sky-600 rounded font-semibold">
                      Target
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={rankBadgeClass(targetDisplayRank)}>
                    {selectedPoint && pointStatus(selectedPoint) !== "ok" ? formatPointLabel(selectedPoint, targetDisplayRank) : formatRank(targetDisplayRank)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-slate-500">
                  {selectedPoint ? (pointStatus(selectedPoint) !== "ok" ? formatPointLabel(selectedPoint, targetDisplayRank) : formatRank(targetDisplayRank)) : "-"}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={top3BadgeClass(targetDisplayTop3Pct)}>
                    {selectedPoint && pointStatus(selectedPoint) !== "ok" ? "-" : selectedPoint ? (targetDisplayRank <= 3 ? "Yes" : "No") : `${scan.top3Pct}%`}
                  </span>
                </td>
              </tr>

              {/* Competitors */}
              {tableCompetitors.slice(0, 20).map((comp) => (
                <tr
                  key={businessKey(comp)}
                  className={businessKey(comp) === selectedBusinessKey ? "bg-sky-50" : "hover:bg-slate-50"}
                >
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => showBusinessRankMap(comp)}
                      className="truncate max-w-[180px] block text-left text-slate-700 hover:text-sky-600"
                      title="Show this shop rank map"
                    >
                      {comp.name}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={rankBadgeClass(selectedPoint ? comp.rank : comp.avgRank)}>
                      {selectedPoint ? formatRank(comp.rank) : comp.avgRank}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-slate-500">
                    {comp.position}{comp.position === 1 ? "st" : comp.position === 2 ? "nd" : comp.position === 3 ? "rd" : "th"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={top3BadgeClass(selectedPoint ? (comp.rank <= 3 ? 100 : 0) : comp.top3Pct)}>
                      {selectedPoint ? (comp.rank <= 3 ? "Yes" : "No") : `${comp.top3Pct}%`}
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
          <div className="bg-white rounded-t-2xl border border-b-0 border-slate-200 px-4 py-3 flex items-center gap-4 flex-wrap">
            <div className="text-sm">
              <span className="text-slate-400 mr-1.5">Date:</span>
              <span className="font-medium">{formatDate(scan.createdAt)}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-400 mr-1.5">Keywords:</span>
              <span className="font-medium">{scan.keyword}</span>
            </div>
            {selectedPoint && (
              <div className="text-sm">
                <span className="text-slate-400 mr-1.5">Viewing:</span>
                <span className="font-medium text-sky-600">Point {selectedPointIndex + 1}</span>
              </div>
            )}
            {selectedBusinessKey && (
              <div className="text-sm">
                <span className="text-slate-400 mr-1.5">Rank Map:</span>
                <span className="font-medium text-sky-600">{activeBusinessName}</span>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              {selectedBusinessKey && (
                <button
                  onClick={showTargetRankMap}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-200 text-sky-600 hover:border-sky-400 hover:bg-sky-50 transition-colors"
                >
                  Target Map
                </button>
              )}
              <button
                onClick={() => setSelectedPointIndex(null)}
                disabled={!selectedPoint}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600 transition-colors"
              >
                All Average
              </button>
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
            className="w-full h-[500px] lg:h-[600px] border border-slate-200 rounded-b-2xl bg-slate-100"
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
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: "#7c2d12" }} />
              API error
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: "#6b7280" }} />
              Zero results
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
            {selectedPoint ? "Point Rank" : "Avg Rank"}
          </p>
          <p className="text-2xl font-bold text-[#1a2b4a]">{selectedPoint && pointStatus(selectedPoint) !== "ok" ? formatPointLabel(selectedPoint, displayRank) : formatRank(displayRank)}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
            {selectedPoint ? "Point Top 3" : "Top 3 Points"}
          </p>
          <p className="text-2xl font-bold text-green-600">
            {selectedPoint && pointStatus(selectedPoint) !== "ok" ? "-" : selectedPoint ? (selectedPointTop3 ? "Yes" : "No") : top3Count}
            {!selectedPoint && (
              <span className="text-base text-slate-400 font-normal">
                /{validPoints.length}
              </span>
            )}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
            {selectedPoint ? "Point Competitors" : "Competitors Found"}
          </p>
          <p className="text-2xl font-bold text-[#1a2b4a]">
            {selectedPoint ? selectedPointCompetitors.length : displayCompetitors.length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
            {selectedPoint ? "Point Status" : "Not Ranking"}
          </p>
          <p className="text-2xl font-bold text-red-500">
            {selectedPoint ? selectedPointStatus : notRankingCount}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Scan Issues</p>
          <p className="text-2xl font-bold text-[#1a2b4a]">{failedPointCount + zeroResultCount}</p>
          <p className="text-xs text-slate-400 mt-1">{failedPointCount} err / {zeroResultCount} zero</p>
        </div>
      </div>
    </div>
  );
}
