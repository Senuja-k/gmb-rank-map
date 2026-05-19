"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ── Shape helpers ───────────────────────────────────────────────────────────
const KM_PER_DEG_LAT = 111.32;
function kmPerDegLng(lat) {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}

function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInCircle(lat, lng, center, radiusKm) {
  const dLat = (lat - center.lat) * KM_PER_DEG_LAT;
  const dLng = (lng - center.lng) * kmPerDegLng(center.lat);
  return Math.sqrt(dLat * dLat + dLng * dLng) <= radiusKm;
}

function getBoundsOfShape(shape, shapeType, center, radiusKm) {
  if (shapeType === "circle") {
    return {
      minLat: center.lat - radiusKm / KM_PER_DEG_LAT,
      maxLat: center.lat + radiusKm / KM_PER_DEG_LAT,
      minLng: center.lng - radiusKm / kmPerDegLng(center.lat),
      maxLng: center.lng + radiusKm / kmPerDegLng(center.lat),
    };
  }
  // square or polygon
  const lats = shape.map((p) => p.lat);
  const lngs = shape.map((p) => p.lng);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

function generateGridInShape(shape, shapeType, center, radiusKm, gridSize, spacingKm) {
  const bounds = getBoundsOfShape(shape, shapeType, center, radiusKm);
  const latSpan = bounds.maxLat - bounds.minLat;
  const lngSpan = bounds.maxLng - bounds.minLng;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;

  const half = Math.floor(gridSize / 2);
  const points = [];

  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      const lat = parseFloat((centerLat + (row * spacingKm) / KM_PER_DEG_LAT).toFixed(6));
      const lng = parseFloat((centerLng + (col * spacingKm) / kmPerDegLng(centerLat)).toFixed(6));

      let inside = false;
      if (shapeType === "circle") {
        inside = pointInCircle(lat, lng, center, radiusKm);
      } else if (shapeType === "polygon" || shapeType === "square") {
        inside = pointInPolygon(lat, lng, shape);
      }
      if (inside) points.push({ lat, lng });
    }
  }
  return points;
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function NewScanPage() {
  const router = useRouter();

  // Google Maps
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const autocompleteInputRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawingManagerRef = useRef(null);
  const currentOverlayRef = useRef(null);
  const gridMarkersRef = useRef([]);
  const businessMarkerRef = useRef(null);

  // Form
  const [place, setPlace] = useState(null);
  const [keywords, setKeywords] = useState([""]);
  const [gridSize, setGridSize] = useState(7);
  const [spacingKm, setSpacingKm] = useState(1);

  // Shape state
  const [shapeType, setShapeType] = useState("square"); // square | circle | polygon
  const [drawnShape, setDrawnShape] = useState(null); // polygon vertices or circle info
  const [gridPoints, setGridPoints] = useState([]);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  // Budget state
  const [budgets, setBudgets] = useState(null); // array of 4
  const [activeKeyIndex, setActiveKeyIndex] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Sync activeKeyIndex from localStorage ─────────────────────────────────
  useEffect(() => {
    const stored = parseInt(localStorage.getItem("activeApiKeyIndex") ?? "0", 10);
    setActiveKeyIndex(Number.isFinite(stored) ? stored : 0);
    const onStorage = (e) => {
      if (e.key === "activeApiKeyIndex") {
        const v = parseInt(e.newValue ?? "0", 10);
        setActiveKeyIndex(Number.isFinite(v) ? v : 0);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ── Fetch budget on mount ─────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/budget")
      .then((r) => r.json())
      .then((d) => setBudgets(d))
      .catch(() => {});
  }, []);

  // ── Load Google Maps ──────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__gmapsLoading) {
      const check = () => {
        if (window.google?.maps?.places && window.google?.maps?.drawing) setMapsLoaded(true);
      };
      check();
      const interval = setInterval(() => {
        check();
        if (window.google?.maps?.places && window.google?.maps?.drawing) clearInterval(interval);
      }, 200);
      return () => clearInterval(interval);
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing. Add it to .env.local.");
      return;
    }

    window.__gmapsLoading = true;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,drawing,marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapsLoaded(true);
    script.onerror = () => setError("Failed to load Google Maps script.");
    document.head.appendChild(script);
  }, []);

  // ── Init Autocomplete ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsLoaded || !autocompleteInputRef.current) return;
    if (!window.google?.maps?.places) return;

    const autocomplete = new window.google.maps.places.Autocomplete(
      autocompleteInputRef.current,
      { types: ["establishment"] }
    );

    autocomplete.addListener("place_changed", () => {
      const p = autocomplete.getPlace();
      if (!p.place_id || !p.geometry?.location) return;
      const newPlace = {
        placeId: p.place_id,
        name: p.name ?? "",
        lat: p.geometry.location.lat(),
        lng: p.geometry.location.lng(),
      };
      setPlace(newPlace);
    });
  }, [mapsLoaded]);

  // ── Init Map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsLoaded || !mapContainerRef.current) return;
    if (mapRef.current) return;

    mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
      center: { lat: 6.9271, lng: 79.8612 }, // Default: Colombo
      zoom: 12,
      mapId: "new-scan-map",
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
    });
  }, [mapsLoaded]);

  // ── Center map & add business marker when place is selected ────────────
  useEffect(() => {
    if (!mapRef.current || !place) return;
    mapRef.current.setCenter({ lat: place.lat, lng: place.lng });
    mapRef.current.setZoom(13);

    // Remove old marker
    if (businessMarkerRef.current) {
      businessMarkerRef.current.setMap(null);
      businessMarkerRef.current = null;
    }

    // Create business marker icon
    const markerEl = document.createElement("div");
    markerEl.style.cssText = `
      width: 36px; height: 36px; border-radius: 50%;
      background: #e74c3c; border: 3px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
    `;
    markerEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
    </svg>`;
    markerEl.title = place.name;

    try {
      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current,
        position: { lat: place.lat, lng: place.lng },
        content: markerEl,
        title: place.name,
        zIndex: 9999,
      });
      businessMarkerRef.current = marker;
    } catch {
      // Fallback to standard marker if AdvancedMarkerElement not available
      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lat: place.lat, lng: place.lng },
        title: place.name,
        icon: {
          url: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="#e74c3c" stroke="white" stroke-width="3"/><path d="M18 8c-3.31 0-6 2.69-6 6 0 4.5 6 11 6 11s6-6.5 6-11c0-3.31-2.69-6-6-6zm0 8.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="white"/></svg>`),
          scaledSize: new window.google.maps.Size(36, 36),
          anchor: new window.google.maps.Point(18, 18),
        },
        zIndex: 9999,
      });
      businessMarkerRef.current = marker;
    }
  }, [place]);

  // ── Setup drawing manager based on shapeType ─────────────────────────────
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current) return;
    if (!window.google?.maps?.drawing) return;

    // Remove existing drawing manager
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setMap(null);
      drawingManagerRef.current = null;
    }

    let drawingMode = null;
    if (shapeType === "square") drawingMode = window.google.maps.drawing.OverlayType.RECTANGLE;
    else if (shapeType === "circle") drawingMode = window.google.maps.drawing.OverlayType.CIRCLE;
    else if (shapeType === "polygon") drawingMode = window.google.maps.drawing.OverlayType.POLYGON;

    const dm = new window.google.maps.drawing.DrawingManager({
      drawingMode,
      drawingControl: false,
      rectangleOptions: {
        fillColor: "#0ea5e9",
        fillOpacity: 0.15,
        strokeColor: "#0ea5e9",
        strokeWeight: 2,
        editable: true,
        draggable: true,
      },
      circleOptions: {
        fillColor: "#0ea5e9",
        fillOpacity: 0.15,
        strokeColor: "#0ea5e9",
        strokeWeight: 2,
        editable: true,
        draggable: true,
      },
      polygonOptions: {
        fillColor: "#0ea5e9",
        fillOpacity: 0.15,
        strokeColor: "#0ea5e9",
        strokeWeight: 2,
        editable: true,
        draggable: true,
      },
    });

    dm.setMap(mapRef.current);
    drawingManagerRef.current = dm;

    const extractShape = (overlay, type) => {
      // Remove previous overlay
      if (currentOverlayRef.current) {
        currentOverlayRef.current.setMap(null);
      }
      currentOverlayRef.current = overlay;
      dm.setDrawingMode(null);

      const update = () => {
        if (type === "rectangle") {
          const bounds = overlay.getBounds();
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          setDrawnShape({
            type: "square",
            vertices: [
              { lat: ne.lat(), lng: ne.lng() },
              { lat: ne.lat(), lng: sw.lng() },
              { lat: sw.lat(), lng: sw.lng() },
              { lat: sw.lat(), lng: ne.lng() },
            ],
            center: {
              lat: (ne.lat() + sw.lat()) / 2,
              lng: (ne.lng() + sw.lng()) / 2,
            },
          });
        } else if (type === "circle") {
          const c = overlay.getCenter();
          const r = overlay.getRadius();
          setDrawnShape({
            type: "circle",
            center: { lat: c.lat(), lng: c.lng() },
            radiusKm: r / 1000,
          });
        } else if (type === "polygon") {
          const path = overlay.getPath();
          const verts = [];
          path.forEach((p) => verts.push({ lat: p.lat(), lng: p.lng() }));
          setDrawnShape({
            type: "polygon",
            vertices: verts,
            center: {
              lat: verts.reduce((s, v) => s + v.lat, 0) / verts.length,
              lng: verts.reduce((s, v) => s + v.lng, 0) / verts.length,
            },
          });
        }
      };

      update();

      // Listen for shape edits
      if (type === "rectangle") {
        overlay.addListener("bounds_changed", update);
      } else if (type === "circle") {
        overlay.addListener("radius_changed", update);
        overlay.addListener("center_changed", update);
      } else if (type === "polygon") {
        const path = overlay.getPath();
        window.google.maps.event.addListener(path, "set_at", update);
        window.google.maps.event.addListener(path, "insert_at", update);
        window.google.maps.event.addListener(path, "remove_at", update);
      }
      overlay.addListener("dragend", update);
    };

    window.google.maps.event.addListener(dm, "rectanglecomplete", (r) => extractShape(r, "rectangle"));
    window.google.maps.event.addListener(dm, "circlecomplete", (c) => extractShape(c, "circle"));
    window.google.maps.event.addListener(dm, "polygoncomplete", (p) => extractShape(p, "polygon"));

    return () => {
      dm.setMap(null);
    };
  }, [mapsLoaded, shapeType]);

  // ── Generate grid preview when shape or grid config changes ───────────────
  useEffect(() => {
    if (!drawnShape) {
      setGridPoints([]);
      return;
    }

    let pts = [];
    if (drawnShape.type === "square") {
      pts = generateGridInShape(drawnShape.vertices, "square", drawnShape.center, 0, gridSize, spacingKm);
    } else if (drawnShape.type === "circle") {
      pts = generateGridInShape([], "circle", drawnShape.center, drawnShape.radiusKm, gridSize, spacingKm);
    } else if (drawnShape.type === "polygon") {
      pts = generateGridInShape(drawnShape.vertices, "polygon", drawnShape.center, 0, gridSize, spacingKm);
    }
    setGridPoints(pts);
  }, [drawnShape, gridSize, spacingKm]);

  // ── Render grid point markers on map ──────────────────────────────────────
  useEffect(() => {
    // Clear old markers
    gridMarkersRef.current.forEach((m) => m.setMap(null));
    gridMarkersRef.current = [];

    if (!mapRef.current || !gridPoints.length) return;

    gridPoints.forEach((pt) => {
      const marker = new window.google.maps.Marker({
        position: { lat: pt.lat, lng: pt.lng },
        map: mapRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: "#475569",
          fillOpacity: 0.7,
          strokeColor: "#fff",
          strokeWeight: 1,
        },
      });
      gridMarkersRef.current.push(marker);
    });
  }, [gridPoints]);

  // ── Keywords management ───────────────────────────────────────────────────
  const addKeyword = () => setKeywords([...keywords, ""]);
  const removeKeyword = (idx) => {
    if (keywords.length <= 1) return;
    setKeywords(keywords.filter((_, i) => i !== idx));
  };
  const updateKeyword = (idx, val) => {
    const copy = [...keywords];
    copy[idx] = val;
    setKeywords(copy);
  };

  // ── Clear drawn shape ────────────────────────────────────────────────────
  const clearShape = () => {
    if (currentOverlayRef.current) {
      currentOverlayRef.current.setMap(null);
      currentOverlayRef.current = null;
    }
    setDrawnShape(null);
    setGridPoints([]);
    // Re-enable drawing mode
    if (drawingManagerRef.current) {
      let mode = null;
      if (shapeType === "square") mode = window.google.maps.drawing.OverlayType.RECTANGLE;
      else if (shapeType === "circle") mode = window.google.maps.drawing.OverlayType.CIRCLE;
      else if (shapeType === "polygon") mode = window.google.maps.drawing.OverlayType.POLYGON;
      drawingManagerRef.current.setDrawingMode(mode);
    }
  };

  // ── Run Scan (one per keyword) ────────────────────────────────────────────
  const runScan = useCallback(async (force = false) => {
    if (!place) return;

    const validKeywords = keywords.map((k) => k.trim()).filter(Boolean);
    if (validKeywords.length === 0) validKeywords.push("");

    // Determine center — use shape center if drawn, otherwise use place location
    const center = drawnShape ? drawnShape.center : { lat: place.lat, lng: place.lng };
    const pointsToScan = gridPoints.length > 0 ? gridPoints : null;

    setScanning(true);
    setError("");
    const totalKeywords = validKeywords.length;
    let lastScanId = null;

    try {
      for (let i = 0; i < validKeywords.length; i++) {
        const kw = validKeywords[i];
        setProgress(`Scanning keyword ${i + 1}/${totalKeywords}: "${kw || "(no keyword)"}"`);

        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetPlaceId: place.placeId,
            businessName: place.name,
            keyword: kw,
            center,
            gridSize,
            spacingKm,
            customGrid: pointsToScan,
            force,
            apiKeyIndex: activeKeyIndex,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Server error ${res.status} for keyword "${kw}"`);
        }

        const data = await res.json();
        lastScanId = data.scan.id;
      }

      // If multiple keywords, go to the list page; if single, go to the heatmap
      if (totalKeywords > 1) {
        router.push("/");
      } else {
        router.push(`/heatmap/${lastScanId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
      setScanning(false);
    }
  }, [place, keywords, gridSize, spacingKm, drawnShape, gridPoints, router, activeKeyIndex]);

  const totalPoints = gridPoints.length > 0 ? gridPoints.length : gridSize * gridSize;

  // ── Budget helpers ────────────────────────────────────────────────────────
  const validKw = keywords.filter((k) => k.trim()).length || 1;
  const totalScans = totalPoints * validKw;
  const usesTextSearch = keywords.some((k) => k.trim().length > 0);
  const activeBudget = budgets?.[activeKeyIndex] ?? null;
  const relevantRemaining = activeBudget
    ? usesTextSearch
      ? activeBudget.textSearchRemaining
      : activeBudget.nearbySearchRemaining
    : Infinity;
  const overBudget = totalScans > relevantRemaining;
  const overBy = totalScans - relevantRemaining;

  const handleRunScan = () => {
    if (overBudget) {
      setShowConfirm(true);
    } else {
      runScan(false);
    }
  };

  return (
    <div className="px-8 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-[#1a2b4a]">New Heatmap Scan</h1>
        <p className="text-sm text-slate-400 mt-1">
          Search for a business, draw the scan area on the map, add keywords, and run.
        </p>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Left: Map */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Map toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex-wrap">
              <span className="text-xs font-semibold uppercase text-slate-500 mr-2">Draw Area:</span>
              {["square", "circle", "polygon"].map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    clearShape();
                    setShapeType(type);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    shapeType === type
                      ? "bg-sky-500 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
              {drawnShape && (
                <button
                  onClick={clearShape}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 ml-auto"
                >
                  Clear Shape
                </button>
              )}
            </div>
            {/* Map */}
            <div ref={mapContainerRef} className="w-full" style={{ height: 480 }} />
            {/* Points counter */}
            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Points: <strong className="text-sky-600">{totalPoints}</strong>
                {gridPoints.length > 0 && " (inside shape)"}
              </span>
              {drawnShape && (
                <span className="text-xs text-green-600 font-medium">Area drawn ✓</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Form */}
        <div className="lg:w-[380px] shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
            {/* Business */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Business
              </label>
              <input
                ref={autocompleteInputRef}
                type="text"
                placeholder="Search for your business..."
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
              />
              {place && (
                <p className="text-xs text-slate-400 mt-1 truncate">
                  {place.name}
                </p>
              )}
            </div>

            {/* Keywords */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Keywords
              </label>
              <div className="space-y-2">
                {keywords.map((kw, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={kw}
                      onChange={(e) => updateKeyword(idx, e.target.value)}
                      placeholder={`e.g. "cosmetics store near me"`}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
                    />
                    {keywords.length > 1 && (
                      <button
                        onClick={() => removeKeyword(idx)}
                        className="px-2 text-red-400 hover:text-red-600 text-lg leading-none"
                        title="Remove keyword"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={addKeyword}
                className="mt-2 text-xs text-sky-500 hover:text-sky-700 font-medium"
              >
                + Add another keyword
              </button>
              <p className="text-xs text-slate-400 mt-1">
                Each keyword will create a separate heatmap scan.
              </p>
            </div>

            {/* Grid config */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Grid Size
                </label>
                <select
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 cursor-pointer"
                >
                  <option value={3}>3×3</option>
                  <option value={5}>5×5</option>
                  <option value={7}>7×7</option>
                  <option value={9}>9×9</option>
                  <option value={11}>11×11</option>
                  <option value={13}>13×13</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Spacing
                </label>
                <select
                  value={spacingKm}
                  onChange={(e) => setSpacingKm(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400 cursor-pointer"
                >
                  <option value={0.5}>0.5 km</option>
                  <option value={1}>1 km</option>
                  <option value={1.5}>1.5 km</option>
                  <option value={2}>2 km</option>
                </select>
              </div>
            </div>

            {/* Info */}
            <div className={`rounded-lg p-3 text-xs space-y-1 ${overBudget ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}`}>
              <p><strong className={overBudget ? 'text-red-700' : 'text-sky-600'}>{totalPoints}</strong> grid points × <strong className={overBudget ? 'text-red-700' : 'text-sky-600'}>{validKw}</strong> keyword(s) = <strong>{totalScans}</strong> total scans</p>
              {overBudget && (
                <p className="font-semibold text-red-600">
                  ⚠ {overBy.toLocaleString()} calls over free tier limit ({relevantRemaining.toLocaleString()} remaining). Charges will apply at $0.032/call.
                </p>
              )}
              {!drawnShape && <p>Draw a shape on the map or we'll use a {gridSize}×{gridSize} grid centered on the business.</p>}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Scan progress */}
            {scanning && (
              <div>
                <p className="text-sm text-slate-500 mb-2">{progress}</p>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full shimmer-bar rounded-full w-full" />
                </div>
              </div>
            )}

            {/* Confirmation modal */}
            {showConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
                  <h3 className="text-lg font-bold text-red-600 mb-2">Over Free Tier Limit</h3>
                  <p className="text-sm text-slate-600 mb-1">
                    This scan needs <strong>{totalScans.toLocaleString()}</strong> API calls but only <strong>{relevantRemaining.toLocaleString()}</strong> free calls remain.
                  </p>
                  <p className="text-sm text-slate-600 mb-4">
                    The extra <strong>{overBy.toLocaleString()}</strong> calls will be billed at <strong>$0.032 each</strong> (~${(overBy * 0.032).toFixed(2)}).
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { setShowConfirm(false); runScan(true); }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                    >
                      Run Anyway
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Action */}
            <button
              onClick={handleRunScan}
              disabled={scanning || !place}
              className={`w-full py-3 rounded-lg font-semibold text-sm text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                overBudget && !scanning
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-sky-500 hover:bg-sky-600'
              }`}
            >
              {scanning ? "Scanning…" : overBudget ? "Run Scan (Over Limit)" : "Run Scan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
