"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  {
    section: "Heat Map",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
    children: [
      { label: "New", href: "/new" },
      { label: "History", href: "/" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [budget, setBudget] = useState(null);

  useEffect(() => {
    fetch("/api/budget")
      .then((r) => r.json())
      .then((d) => setBudget(d))
      .catch(() => {});
  }, []);

  const budgetPct = budget ? ((budget.totalCalls) / budget.totalFreeLimit) * 100 : 0;

  return (
    <aside className="w-[240px] shrink-0 bg-[#1a2b4a] text-white flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center text-sm font-bold">
            RM
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">GMB Rank Map</h1>
            <p className="text-[10px] text-slate-400">Geo-Grid Tracker</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navItems.map((section) => (
          <div key={section.section}>
            <div className="flex items-center gap-2 px-3 mb-1">
              <span className="text-slate-400">{section.icon}</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {section.section}
              </span>
            </div>
            <ul className="space-y-0.5 ml-2">
              {section.children.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block text-[13px] px-4 py-1.5 rounded transition-colors ${
                        isActive
                          ? "text-white bg-white/10 font-medium"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Budget */}
      {budget && (
        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            Free Monthly Calls
          </p>
          {/* Text Search */}
          <div className="mb-2">
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="text-[10px] text-slate-400">Text Search</span>
              <span className="text-[10px] text-slate-500 tabular-nums">
                {budget.textSearchCalls.toLocaleString()} / {budget.textSearchLimit.toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (budget.textSearchCalls / budget.textSearchLimit) * 100)}%`,
                  background:
                    budget.textSearchCalls / budget.textSearchLimit > 0.9
                      ? "#ef4444"
                      : budget.textSearchCalls / budget.textSearchLimit > 0.7
                        ? "#f59e0b"
                        : "#22c55e",
                }}
              />
            </div>
          </div>
          {/* Nearby Search */}
          <div className="mb-2">
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="text-[10px] text-slate-400">Nearby Search</span>
              <span className="text-[10px] text-slate-500 tabular-nums">
                {budget.nearbySearchCalls.toLocaleString()} / {budget.nearbySearchLimit.toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (budget.nearbySearchCalls / budget.nearbySearchLimit) * 100)}%`,
                  background:
                    budget.nearbySearchCalls / budget.nearbySearchLimit > 0.9
                      ? "#ef4444"
                      : budget.nearbySearchCalls / budget.nearbySearchLimit > 0.7
                        ? "#f59e0b"
                        : "#22c55e",
                }}
              />
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>{budget.totalRemaining > 0 ? `${budget.totalRemaining.toLocaleString()} calls left` : ''}</span>
            <span>{budget.totalCalls.toLocaleString()} used</span>
          </div>
          {budget.textSearchCalls > budget.textSearchLimit && (
            <div className="flex items-center gap-1 text-red-400 text-[10px] font-medium mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Text Search: {(budget.textSearchCalls - budget.textSearchLimit).toLocaleString()} over limit
            </div>
          )}
          {budget.nearbySearchCalls > budget.nearbySearchLimit && (
            <div className="flex items-center gap-1 text-red-400 text-[10px] font-medium mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Nearby Search: {(budget.nearbySearchCalls - budget.nearbySearchLimit).toLocaleString()} over limit
            </div>
          )}
          {budget.blocked && budget.textSearchCalls <= budget.textSearchLimit && budget.nearbySearchCalls <= budget.nearbySearchLimit && (
            <div className="flex items-center gap-1 text-red-400 text-[10px] font-medium mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Limit reached
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-[9px] text-slate-600 text-center">
          Powered by Google Places API
        </p>
      </div>
    </aside>
  );
}
