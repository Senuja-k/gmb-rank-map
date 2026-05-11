"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * LocationPicker
 * Fetches saved (enabled) GBP locations from Supabase and renders a dropdown.
 *
 * Props:
 *   value    – currently selected location object { locationName, email, displayName }
 *   onChange – called with the selected location object (or null)
 */
export default function LocationPicker({ value, onChange }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gbp/connect/saved")
      .then((r) => r.json())
      .then((data) => {
        setLocations((data.locations ?? []).filter((l) => l.is_enabled));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-400 bg-slate-50">
        Loading locations…
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
        <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        No locations connected.{" "}
        <Link href="/gbp/connect" className="text-sky-600 underline font-medium">
          Connect locations →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
      <select
        value={value?.locationName ?? ""}
        onChange={(e) => {
          const loc = locations.find((l) => l.location_name === e.target.value);
          onChange(
            loc
              ? {
                  locationName: loc.location_name,
                  email: loc.google_email,
                  displayName: loc.display_name,
                  address: loc.address,
                }
              : null
          );
        }}
        required
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
      >
        <option value="">Select a location…</option>
        {locations.map((loc) => (
          <option key={loc.location_name} value={loc.location_name}>
            {loc.display_name}
            {loc.address ? ` — ${loc.address}` : ""}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-slate-400 mt-1">
        Manage locations in{" "}
        <Link href="/gbp/connect" className="text-sky-500 hover:underline">
          GBP Connect
        </Link>
      </p>
    </div>
  );
}
