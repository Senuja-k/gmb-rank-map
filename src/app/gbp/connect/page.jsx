"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ConnectPage() {
  const searchParams = useSearchParams();
  const justConnected = searchParams.get("connected"); // email from redirect

  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);

  // Per-account state: fetched locations & selection
  const [fetchedLocations, setFetchedLocations] = useState({}); // email → loc[]
  const [fetching, setFetching] = useState({}); // email → bool
  const [selection, setSelection] = useState({}); // locationName → bool
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // Saved locations in Supabase
  const [savedLocations, setSavedLocations] = useState([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [togglingLocation, setTogglingLocation] = useState(null);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const res = await fetch("/api/gbp/connect/accounts");
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch("/api/gbp/connect/saved");
      const data = await res.json();
      setSavedLocations(data.locations ?? []);
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadSaved();
  }, [loadAccounts, loadSaved]);

  async function syncLocations(email) {
    setFetching((prev) => ({ ...prev, [email]: true }));
    try {
      const res = await fetch(
        `/api/gbp/connect/locations?email=${encodeURIComponent(email)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const locs = data.locations ?? [];
      setFetchedLocations((prev) => ({ ...prev, [email]: locs }));
      // Pre-check locations that are already saved and enabled
      const sel = {};
      locs.forEach((l) => {
        const existing = savedLocations.find(
          (s) => s.location_name === l.locationName
        );
        sel[l.locationName] = existing ? existing.is_enabled : true;
      });
      setSelection((prev) => ({ ...prev, ...sel }));
    } catch (err) {
      alert(`Failed to fetch locations: ${err.message}`);
    } finally {
      setFetching((prev) => ({ ...prev, [email]: false }));
    }
  }

  async function saveSelection(email) {
    const locs = fetchedLocations[email] ?? [];
    const payload = locs.map((loc) => ({
      locationName: loc.locationName,
      accountName: loc.accountName,
      displayName: loc.displayName,
      address: loc.address,
      isEnabled: selection[loc.locationName] ?? false,
    }));

    setSaving(true);
    setSavedMsg("");
    try {
      const res = await fetch("/api/gbp/connect/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locations: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSavedMsg(`Saved ${data.saved} location(s).`);
      await loadSaved();
    } catch (err) {
      setSavedMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSaved(locationName, currentValue) {
    setTogglingLocation(locationName);
    try {
      await fetch("/api/gbp/connect/toggle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationName, isEnabled: !currentValue }),
      });
      await loadSaved();
    } finally {
      setTogglingLocation(null);
    }
  }

  async function disconnect(email) {
    if (!confirm(`Disconnect ${email}? This will remove their access tokens.`)) return;
    await fetch(
      `/api/gbp/connect/accounts?email=${encodeURIComponent(email)}`,
      { method: "DELETE" }
    );
    setFetchedLocations((prev) => {
      const n = { ...prev };
      delete n[email];
      return n;
    });
    await loadAccounts();
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1a2b4a]">GBP Connect</h1>
        <p className="text-sm text-slate-500 mt-1">
          Connect your Google account, choose which Business Profile locations this
          app can access, and manage access at any time.
        </p>
      </div>

      {/* Success banner */}
      {justConnected && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-green-800">
            <span className="font-semibold">{justConnected}</span> connected successfully!
            Click <strong>Sync Locations</strong> below to choose which locations to enable.
          </p>
        </div>
      )}

      {/* ── Connected accounts ─────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Connected Google Accounts</h2>
          <a
            href="/api/gbp/auth"
            className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Connect Account
          </a>
        </div>

        {accountsLoading ? (
          <p className="text-sm text-slate-400 px-5 py-6 text-center">Loading…</p>
        ) : accounts.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-slate-500">No Google accounts connected yet.</p>
            <a
              href="/api/gbp/auth"
              className="mt-3 inline-block text-sm text-sky-600 font-medium underline"
            >
              Connect your Google account →
            </a>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map((acc) => {
              const email = acc.google_email ?? acc.account_id;
              const locs = fetchedLocations[email];
              const isFetching = fetching[email];

              return (
                <li key={email} className="px-5 py-4 space-y-4">
                  {/* Account row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 text-sm font-bold uppercase">
                        {email[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{email}</p>
                        <p className="text-[11px] text-slate-400">
                          Last updated:{" "}
                          {new Date(acc.updated_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => syncLocations(email)}
                        disabled={isFetching}
                        className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isFetching ? "Syncing…" : "Sync Locations"}
                      </button>
                      <button
                        onClick={() => disconnect(email)}
                        className="text-xs font-medium text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>

                  {/* Fetched locations */}
                  {locs && (
                    <div className="ml-11 space-y-3">
                      {locs.length === 0 ? (
                        <p className="text-sm text-slate-400">No locations found for this account.</p>
                      ) : (
                        <>
                          <p className="text-xs text-slate-500 font-medium">
                            Select which locations this app can access:
                          </p>
                          <div className="space-y-2">
                            {locs.map((loc) => (
                              <label
                                key={loc.locationName}
                                className="flex items-start gap-3 cursor-pointer group"
                              >
                                <input
                                  type="checkbox"
                                  checked={selection[loc.locationName] ?? false}
                                  onChange={(e) =>
                                    setSelection((prev) => ({
                                      ...prev,
                                      [loc.locationName]: e.target.checked,
                                    }))
                                  }
                                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                                />
                                <div>
                                  <p className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                                    {loc.displayName}
                                  </p>
                                  {loc.address && (
                                    <p className="text-[11px] text-slate-400">{loc.address}</p>
                                  )}
                                </div>
                              </label>
                            ))}
                          </div>
                          <div className="flex items-center gap-3 pt-1">
                            <button
                              onClick={() => saveSelection(email)}
                              disabled={saving}
                              className="bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                            >
                              {saving ? "Saving…" : "Save Selection"}
                            </button>
                            {savedMsg && (
                              <span className="text-xs text-slate-500">{savedMsg}</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Saved locations ────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Saved Locations</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Toggle access on/off without re-syncing. New locations from Google appear after Sync.
          </p>
        </div>

        {savedLoading ? (
          <p className="text-sm text-slate-400 px-5 py-6 text-center">Loading…</p>
        ) : savedLocations.length === 0 ? (
          <p className="text-sm text-slate-400 px-5 py-6 text-center">
            No locations saved yet. Sync an account above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {savedLocations.map((loc) => (
                <tr key={loc.location_name} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{loc.display_name}</p>
                    {loc.address && (
                      <p className="text-[11px] text-slate-400">{loc.address}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{loc.google_email}</td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => toggleSaved(loc.location_name, loc.is_enabled)}
                      disabled={togglingLocation === loc.location_name}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                        loc.is_enabled ? "bg-sky-500" : "bg-slate-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          loc.is_enabled ? "translate-x-4" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
