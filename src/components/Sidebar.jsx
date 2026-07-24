"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const navItems = [
  {
    section: "Rank Tracker",
    children: [
      {
        label: "New Scan",
        href: "/new",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        ),
      },
      {
        label: "Scan History",
        href: "/",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
    ],
  },
  {
    section: "GBP Manager",
    children: [
      {
        label: "Reviews",
        href: "/gbp/reviews",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        ),
      },
      {
        label: "Review Counter",
        href: "/gbp/review-counter",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m-6 4h6m-6 4h4m-8 5h14a2 2 0 002-2V6a2 2 0 00-2-2h-3.5L14 2h-4L8.5 4H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        label: "Posts",
        href: "/gbp/posts",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
      },
      {
        label: "Scheduled Posts",
        href: "/gbp/scheduled-posts",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M5 11h14m-14 8h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2zm7-5l2 2 4-4" />
          </svg>
        ),
      },
      {
        label: "Performance",
        href: "/gbp/performance",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
      {
        label: "Connect",
        href: "/gbp/connect",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        ),
      },
    ],
  },
];

const API_KEY_COUNT = 2;

function getStoredKeyIndex() {
  if (typeof window === "undefined") return 0;
  const v = parseInt(localStorage.getItem("activeApiKeyIndex") ?? "0", 10);
  return Number.isFinite(v) && v >= 0 && v < API_KEY_COUNT ? v : 0;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [budgets, setBudgets] = useState(null); // array of 4 budget objects
  const [budgetError, setBudgetError] = useState(false);
  const [activeKeyIndex, setActiveKeyIndex] = useState(() => getStoredKeyIndex());
  const [profile, setProfile] = useState(null);

  const hiddenRoutes = ["/login"];
  const isHidden = hiddenRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));

  const visibleNavItems = profile && ["admin", "super_admin"].includes(profile.role)
    ? [
        ...navItems,
        {
          section: "Admin",
          children: [
            {
              label: "Users",
              href: "/admin/users",
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4-3a4 4 0 100-8 4 4 0 000 8zm6 0a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              ),
            },
          ],
        },
      ]
    : navItems;

  useEffect(() => {
    if (isHidden) return;
    fetch("/api/auth/me")
      .then((r) => {
        if (r.status === 401) {
          router.replace("/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (data) setProfile(data.profile ?? null);
      })
      .catch(() => setProfile(null));
  }, [isHidden, router]);

  useEffect(() => {
    if (isHidden) return;
    fetch("/api/budget")
      .then((r) => {
        if (r.status === 401) {
          setBudgets(null);
          setBudgetError(false);
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        if (Array.isArray(d)) {
          setBudgets(d);
          setBudgetError(false);
        } else {
          setBudgetError(true);
        }
      })
      .catch(() => setBudgetError(true));
  }, [pathname, isHidden]);

  function switchKey(idx) {
    setActiveKeyIndex(idx);
    localStorage.setItem("activeApiKeyIndex", String(idx));
    // Notify other tabs/components
    window.dispatchEvent(new StorageEvent("storage", { key: "activeApiKeyIndex", newValue: String(idx) }));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (isHidden) return null;

  return (
    <aside
      className="w-55 shrink-0 flex flex-col h-screen sticky top-0 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0f1c33 0%, #1a2b4a 100%)" }}
    >
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg shrink-0"
            style={{ background: "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)" }}
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-[13px] font-bold text-white leading-tight tracking-tight">GBP Manager</h1>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-none">Business Profile Suite</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/6 mb-3" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-4 pb-4">
        {visibleNavItems.map((group) => (
          <div key={group.section}>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600 px-3 mb-1.5">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {group.children.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${
                        isActive
                          ? "bg-sky-500/20 text-sky-300 font-medium"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                      }`}
                    >
                      <span
                        className={`shrink-0 transition-colors ${
                          isActive ? "text-sky-400" : "text-slate-500 group-hover:text-slate-300"
                        }`}
                      >
                        {item.icon}
                      </span>
                      {item.label}
                      {isActive && (
                        <span className="ml-auto w-1 h-1 rounded-full bg-sky-400" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Budget card */}
      {budgetError && (
        <>
          <div className="mx-4 h-px bg-white/6" />
          <div className="px-4 py-3">
            <p className="text-[9px] text-red-400 font-medium">
              ⚠ API Usage unavailable — run the Supabase migration
            </p>
          </div>
        </>
      )}
      {budgets && !budgetError && (
        <>
          <div className="mx-4 h-px bg-white/6" />
          <div className="px-4 py-4 space-y-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
              API Usage
            </p>

            {/* Key switcher */}
            <div className="flex gap-1">
              {Array.from({ length: API_KEY_COUNT }, (_, i) => {
                const kb = budgets[i];
                const pct = kb ? Math.min(100, ((kb.textSearchCalls + kb.nearbySearchCalls) / (kb.totalFreeLimit)) * 100) : 0;
                const dot = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
                const isActive = i === activeKeyIndex;
                return (
                  <button
                    key={i}
                    onClick={() => switchKey(i)}
                    title={`Key ${i + 1} — ${kb ? `${(kb.textSearchCalls + kb.nearbySearchCalls).toLocaleString()} / ${kb.totalFreeLimit.toLocaleString()}` : "unknown"}`}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all flex flex-col items-center gap-0.5 ${
                      isActive
                        ? "bg-sky-500/25 text-sky-300 ring-1 ring-sky-500/50"
                        : "bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300"
                    }`}
                  >
                    <span>{i + 1}</span>
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: pct > 0 ? dot : "#374151" }}
                    />
                  </button>
                );
              })}
            </div>

            {/* Active key usage bars */}
            {(() => {
              const kb = budgets[activeKeyIndex];
              if (!kb) return null;
              return (
                <>
                  {[
                    { label: "Text Search", used: kb.textSearchCalls, limit: kb.textSearchLimit },
                    { label: "Nearby Search", used: kb.nearbySearchCalls, limit: kb.nearbySearchLimit },
                  ].map(({ label, used, limit }) => {
                    const pct = Math.min(100, (used / limit) * 100);
                    const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
                    return (
                      <div key={label}>
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-[10px] text-slate-500">{label}</span>
                          <span className="text-[10px] text-slate-600 tabular-nums">
                            {used.toLocaleString()}<span className="text-slate-700">/{limit.toLocaleString()}</span>
                          </span>
                        </div>
                        <div className="w-full h-1 rounded-full bg-white/6 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {kb.blocked && (
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-red-400 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                      Key {activeKeyIndex + 1} limit reached
                    </div>
                  )}
                  {(() => {
                    const searchBudget = budgets[0];
                    if (!searchBudget?.geminiSearchGroundingLimit) return null;
                    const used = searchBudget.geminiSearchGroundingPrompts ?? 0;
                    const limit = searchBudget.geminiSearchGroundingLimit;
                    const pct = Math.min(100, (used / limit) * 100);
                    const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
                    return (
                      <div className="pt-2 mt-2 border-t border-white/6">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-[10px] text-slate-500">Gemini Search</span>
                          <span className="text-[10px] text-slate-600 tabular-nums">
                            {used.toLocaleString()}<span className="text-slate-700">/{limit.toLocaleString()}</span>
                          </span>
                        </div>
                        <div className="w-full h-1 rounded-full bg-white/6 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                        {searchBudget.geminiSearchGroundingBlocked && (
                          <div className="flex items-center gap-1.5 text-[10px] font-medium text-red-400 mt-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                            Search grounding limit reached
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="px-4 pb-4">
        {profile && (
          <div className="mb-3 rounded-lg bg-white/5 px-3 py-2">
            <p className="text-[10px] text-slate-400 truncate">{profile.email}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[9px] uppercase tracking-wide text-slate-600">{profile.role}</span>
              <button onClick={logout} className="text-[10px] font-semibold text-slate-400 hover:text-sky-300">
                Sign out
              </button>
            </div>
          </div>
        )}
        <p className="text-[9px] text-slate-700 text-center">
          Powered by Google APIs &amp; Gemini
        </p>
      </div>
    </aside>
  );
}
