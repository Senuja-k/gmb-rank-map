"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
        label: "Posts",
        href: "/gbp/posts",
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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

export default function Sidebar() {
  const pathname = usePathname();
  const [budget, setBudget] = useState(null);

  useEffect(() => {
    fetch("/api/budget")
      .then((r) => r.json())
      .then((d) => setBudget(d))
      .catch(() => {});
  }, [pathname]);

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
        {navItems.map((group) => (
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
      {budget && (
        <>
          <div className="mx-4 h-px bg-white/6" />
          <div className="px-4 py-4 space-y-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
              API Usage
            </p>

            {[
              { label: "Text Search", used: budget.textSearchCalls, limit: budget.textSearchLimit },
              { label: "Nearby Search", used: budget.nearbySearchCalls, limit: budget.nearbySearchLimit },
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

            {budget.blocked && (
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-red-400 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                Limit reached
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="px-4 pb-4">
        <p className="text-[9px] text-slate-700 text-center">
          Powered by Google APIs &amp; Gemini
        </p>
      </div>
    </aside>
  );
}
