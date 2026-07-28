"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfInputDate(value) {
  return new Date(`${value}T00:00:00`);
}

function defaultStartDate() {
  const now = new Date();
  return toInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
}

function formatReportDate(value) {
  return value.replaceAll("-", "/");
}

function monthLabel(value) {
  return startOfInputDate(value).toLocaleString("en-US", { month: "long" });
}

function formatSavedAt(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monthKey(value) {
  return value?.slice(0, 7) ?? "";
}

function previousMonthKey(value) {
  const date = startOfInputDate(`${monthKey(value)}-01`);
  date.setMonth(date.getMonth() - 1);
  return toInputDate(date).slice(0, 7);
}

function dateValue(value) {
  return startOfInputDate(value).getTime();
}

function numberValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayNumber(value) {
  return value === null || value === undefined || value === "" ? "" : value;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "";
}

function formatRating(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "";
}

const MANUAL_ROWS = [
  "cosmeticsCustomers",
  "supplementCustomers",
  "chatClicks",
];

function emptyManualValues(locations) {
  const values = {};
  for (const row of MANUAL_ROWS) {
    values[row] = {};
    for (const location of locations) values[row][location.location_name] = "";
  }
  return values;
}

function computedValuesToReviewCounts(computedValues = {}, locationNames = []) {
  const counts = {};
  for (const locationName of locationNames) {
    const values = computedValues?.[locationName];
    if (!values) continue;
    counts[locationName] = {
      collected: values.totalReviewsCollected ?? null,
      totalReviews: values.totalReviewsAsOfNow ?? values.totalReviews ?? null,
      lastMonth: values.totalReviewsLastMonth ?? null,
      manualCalculatedReviews: values.manuallyCalculatedReviews ?? null,
      rating: values.rating ?? null,
      googleSearchMobile: values.googleSearchMobile ?? null,
      googleSearchDesktop: values.googleSearchDesktop ?? null,
      googleMapsMobile: values.googleMapsMobile ?? null,
      googleMapsDesktop: values.googleMapsDesktop ?? null,
      calls: values.calls ?? null,
      chatClicks: null,
      directions: values.directions ?? null,
      websiteClicks: values.websiteClicks ?? null,
    };
  }
  return counts;
}

function hasUsableSavedMetrics(metrics) {
  if (!metrics) return false;
  return Number.isFinite(metrics.collected) && Number.isFinite(metrics.totalReviews);
}

function EditableCell({ value, onChange, className = "" }) {
  return (
    <td className={`border border-black p-0 ${className}`}>
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-full w-full min-w-20 bg-transparent px-1.5 py-0.5 text-right text-base outline-none focus:bg-white focus:ring-2 focus:ring-green-600"
        inputMode="decimal"
      />
    </td>
  );
}

export default function ReviewCounterPage() {
  const [locations, setLocations] = useState([]);
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [manualValues, setManualValues] = useState({});
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(toInputDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [counterLoading, setCounterLoading] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState("");
  const [loadingReportId, setLoadingReportId] = useState("");
  const [activeReportId, setActiveReportId] = useState("");
  const [activeReportTitle, setActiveReportTitle] = useState("");
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [counterError, setCounterError] = useState("");
  const [reviewCounts, setReviewCounts] = useState({});
  const [status, setStatus] = useState("");
  const [startupHydrated, setStartupHydrated] = useState(false);
  const [savedSnapshotKey, setSavedSnapshotKey] = useState("");
  const buildRequestIdRef = useRef(0);
  const savedSnapshotKeyRef = useRef("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const locationsRes = await fetch("/api/gbp/connect/saved");
      const locationsData = await locationsRes.json();

      if (!locationsRes.ok) throw new Error(locationsData.error ?? "Failed to load GBP profiles");

      const enabledLocations = (locationsData.locations ?? []).filter((location) => location.is_enabled);
      setLocations(enabledLocations);
      if (!savedSnapshotKeyRef.current) {
        setSelected(new Set(enabledLocations.map((location) => location.location_name)));
      }
      setManualValues((prev) => {
        if (savedSnapshotKeyRef.current) return prev;
        const next = emptyManualValues(enabledLocations);
        for (const row of MANUAL_ROWS) {
          for (const location of enabledLocations) {
            next[row][location.location_name] = prev?.[row]?.[location.location_name] ?? "";
          }
        }
        return next;
      });
    } catch (err) {
      setError(err.message);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    setReportError("");
    try {
      const res = await fetch("/api/gbp/review-reports");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load reports");
      setReports(data.reports ?? []);
    } catch (err) {
      setReportError(err.message);
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const hydrateSavedReport = useCallback((saved, options = {}) => {
    const nextManualValues = emptyManualValues(locations);
    for (const row of MANUAL_ROWS) {
      for (const [locationName, value] of Object.entries(saved.manualValues?.[row] ?? {})) {
        nextManualValues[row][locationName] = value;
      }
    }

    const savedLocationNames = (saved.locations ?? []).map((location) => location.locationName);
    const savedReviewCounts = computedValuesToReviewCounts(saved.computedValues, savedLocationNames);
    const hasSavedSnapshot = savedLocationNames.length > 0 && savedLocationNames.every((locationName) =>
      Object.prototype.hasOwnProperty.call(savedReviewCounts, locationName) && hasUsableSavedMetrics(savedReviewCounts[locationName])
    );
    const nextSnapshotKey = `${saved.startDate}|${saved.endDate}|${[...savedLocationNames].sort().join("|")}`;

    buildRequestIdRef.current += 1;
    savedSnapshotKeyRef.current = hasSavedSnapshot ? nextSnapshotKey : "";
    setSavedSnapshotKey(hasSavedSnapshot ? nextSnapshotKey : "");
    setStartDate(saved.startDate);
    setEndDate(saved.endDate);
    setManualValues(nextManualValues);
    setSelected(new Set(savedLocationNames));
    setActiveReportId(saved.id ?? "");
    setActiveReportTitle(saved.title);

    if (hasSavedSnapshot) {
      setCounterLoading(false);
      setCounterError("");
      setReviewCounts(savedReviewCounts);
      setStatus(`Loaded ${saved.title}.`);
      return true;
    }

    setStatus(options.buildingStatus ?? `Building ${saved.title}...`);
    return false;
  }, [locations]);

  const selectedLocations = useMemo(
    () => locations.filter((location) => selected.has(location.location_name)),
    [locations, selected]
  );

  const reportSelectionKey = useMemo(() => {
    const locationNames = [...selected].sort().join("|");
    return `${startDate}|${endDate}|${locationNames}`;
  }, [endDate, selected, startDate]);

  const loadReviewCounts = useCallback(async () => {
    const requestId = buildRequestIdRef.current + 1;
    buildRequestIdRef.current = requestId;

    if (!startDate || !endDate || selectedLocations.length === 0) {
      if (requestId === buildRequestIdRef.current) setReviewCounts({});
      return;
    }

    savedSnapshotKeyRef.current = "";
    setSavedSnapshotKey("");
    setCounterLoading(true);
    setCounterError("");
    setReviewCounts({});
    try {
      const params = new URLSearchParams({ startDate, endDate });
      for (const location of selectedLocations) params.append("location", location.location_name);
      const res = await fetch(`/api/gbp/review-counter?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load review counts");
      if (requestId !== buildRequestIdRef.current) return;
      setReviewCounts(data.counts ?? {});
      if (data.fetchErrors?.length) setCounterError(data.fetchErrors.join(" | "));
    } catch (err) {
      if (requestId !== buildRequestIdRef.current) return;
      setCounterError(err.message);
      setReviewCounts({});
    } finally {
      if (requestId === buildRequestIdRef.current) setCounterLoading(false);
    }
  }, [endDate, selectedLocations, startDate]);

  useEffect(() => {
    if (!startupHydrated) return;
    if (savedSnapshotKey && savedSnapshotKey === reportSelectionKey) return;
    loadReviewCounts();
  }, [loadReviewCounts, reportSelectionKey, savedSnapshotKey, startupHydrated]);

  useEffect(() => {
    if (loading || reportsLoading || startupHydrated) return;
    const latestSavedReport = reports[0];
    if (latestSavedReport) {
      hydrateSavedReport(latestSavedReport, { buildingStatus: `Building ${latestSavedReport.title}...` });
    }
    setStartupHydrated(true);
  }, [hydrateSavedReport, loading, reports, reportsLoading, startupHydrated]);

  const report = (() => {
    if (!startDate || !endDate) return { metrics: {} };

    const metrics = {};
    const currentMonth = monthKey(startDate);
    const priorMonth = previousMonthKey(startDate);
    const currentEnd = dateValue(endDate);

    for (const location of selectedLocations) {
      const name = location.location_name;
      const googleCollected = reviewCounts[name]?.collected;
      const googleTotalReviews = reviewCounts[name]?.totalReviews;

      const previousMonthReports = reports
        .filter((savedReport) => monthKey(savedReport.endDate) === priorMonth)
        .filter((savedReport) => Number.isFinite(savedReport.computedValues?.[name]?.totalReviewsAsOfNow))
        .sort((a, b) => dateValue(b.endDate) - dateValue(a.endDate));
      const savedLastMonth = previousMonthReports[0]?.computedValues?.[name]?.totalReviewsAsOfNow;

      const previousSameMonthReports = reports
        .filter((savedReport) => savedReport.id !== activeReportId)
        .filter((savedReport) => monthKey(savedReport.startDate) === currentMonth)
        .filter((savedReport) => dateValue(savedReport.endDate) < currentEnd)
        .filter((savedReport) => Number.isFinite(savedReport.computedValues?.[name]?.manuallyCalculatedReviews))
        .sort((a, b) => dateValue(b.endDate) - dateValue(a.endDate));
      const previousSameMonth = previousSameMonthReports[0];
      const previousManual = previousSameMonth?.computedValues?.[name]?.manuallyCalculatedReviews;
      const previousCollected = previousSameMonth?.computedValues?.[name]?.totalReviewsCollected;

      const asOfNow = Number.isFinite(googleTotalReviews) ? googleTotalReviews : null;
      const fallbackLastMonth = Number.isFinite(asOfNow) && Number.isFinite(googleCollected) ? asOfNow - googleCollected : null;
      const lastMonth = Number.isFinite(savedLastMonth) ? savedLastMonth : fallbackLastMonth;
      const collected = Number.isFinite(googleCollected)
        ? googleCollected
        : lastMonth === null || asOfNow === null ? null : asOfNow - lastMonth;
      const newSincePrevious = Number.isFinite(collected) && Number.isFinite(previousCollected)
        ? Math.max(0, collected - previousCollected)
        : null;
      const manualCount = Number.isFinite(previousManual) && newSincePrevious !== null
        ? previousManual + newSincePrevious
        : collected;

      metrics[name] = {
        lastMonth,
        asOfNow,
        collected,
        manualCount,
        deleted: manualCount === null || collected === null ? null : manualCount - collected,
      };
    }

    return { metrics };
  })();

  function updateManual(row, locationName, value) {
    setManualValues((prev) => ({
      ...prev,
      [row]: {
        ...(prev[row] ?? {}),
        [locationName]: value,
      },
    }));
  }

  function manual(row, locationName) {
    return manualValues?.[row]?.[locationName] ?? "";
  }

  function manualNumber(row, locationName) {
    return numberValue(manual(row, locationName));
  }

  function totalCustomers(locationName) {
    const cosmetics = manualNumber("cosmeticsCustomers", locationName);
    const supplement = manualNumber("supplementCustomers", locationName);
    if (cosmetics === null && supplement === null) return null;
    return (cosmetics ?? 0) + (supplement ?? 0);
  }

  function conversionRate(locationName) {
    const customers = totalCustomers(locationName);
    const collected = report.metrics[locationName]?.collected;
    if (collected === null || collected === undefined || !customers) return null;
    return (collected / customers) * 100;
  }

  function performanceMetric(locationName, metricName) {
    const googleValue = reviewCounts[locationName]?.[metricName];
    if (Number.isFinite(googleValue)) return googleValue;
    return null;
  }

  function chatClicks(locationName) {
    const googleValue = performanceMetric(locationName, "chatClicks");
    if (googleValue !== null) return googleValue;
    return manualNumber("chatClicks", locationName);
  }

  function engagementPer100Views(locationName) {
    const websiteClicks = performanceMetric(locationName, "websiteClicks") ?? 0;
    const calls = performanceMetric(locationName, "calls") ?? 0;
    const chats = chatClicks(locationName) ?? 0;
    const directions = performanceMetric(locationName, "directions") ?? 0;
    const views =
      (performanceMetric(locationName, "googleSearchMobile") ?? 0) +
      (performanceMetric(locationName, "googleSearchDesktop") ?? 0) +
      (performanceMetric(locationName, "googleMapsMobile") ?? 0) +
      (performanceMetric(locationName, "googleMapsDesktop") ?? 0);

    if (!views) return null;
    return ((websiteClicks + calls + chats + directions) / views) * 100;
  }

  function toggleLocation(locationName) {
    savedSnapshotKeyRef.current = "";
    setSavedSnapshotKey("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(locationName)) next.delete(locationName);
      else next.add(locationName);
      return next;
    });
  }

  function selectAll() {
    savedSnapshotKeyRef.current = "";
    setSavedSnapshotKey("");
    setSelected(new Set(locations.map((location) => location.location_name)));
  }

  function clearSelection() {
    savedSnapshotKeyRef.current = "";
    setSavedSnapshotKey("");
    setSelected(new Set());
  }

  function buildComputedValues() {
    const values = {};
    for (const location of selectedLocations) {
      const name = location.location_name;
      values[name] = {
        totalCustomers: totalCustomers(name),
        totalReviewsLastMonth: report.metrics[name]?.lastMonth ?? null,
        totalReviewsAsOfNow: report.metrics[name]?.asOfNow ?? null,
        totalReviewsCollected: report.metrics[name]?.collected ?? null,
        manuallyCalculatedReviews: report.metrics[name]?.manualCount ?? null,
        deletedReviews: report.metrics[name]?.deleted ?? null,
        conversionRate: conversionRate(name),
        rating: performanceMetric(name, "rating"),
        googleSearchMobile: performanceMetric(name, "googleSearchMobile"),
        googleSearchDesktop: performanceMetric(name, "googleSearchDesktop"),
        googleMapsMobile: performanceMetric(name, "googleMapsMobile"),
        googleMapsDesktop: performanceMetric(name, "googleMapsDesktop"),
        calls: performanceMetric(name, "calls"),
        chatClicks: chatClicks(name),
        directions: performanceMetric(name, "directions"),
        websiteClicks: performanceMetric(name, "websiteClicks"),
        engagementPer100Views: engagementPer100Views(name),
      };
    }
    return values;
  }

  async function saveReportRun() {
    setSavingReport(true);
    setStatus("");
    setReportError("");
    try {
      const title = `Google Reviews ${monthLabel(startDate)} ${formatReportDate(startDate)}-${formatReportDate(endDate)}`;
      const res = await fetch("/api/gbp/review-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          startDate,
          endDate,
          monthLabel: monthLabel(startDate),
          locations: selectedLocations.map((location) => ({
            locationName: location.location_name,
            displayName: location.display_name,
            googleEmail: location.google_email,
          })),
          manualValues,
          computedValues: buildComputedValues(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save report");
      setReports((prev) => [data.report, ...prev]);
      setActiveReportId(data.report.id);
      setActiveReportTitle(data.report.title);
      setStatus("Report saved.");
    } catch (err) {
      setReportError(err.message);
    } finally {
      setSavingReport(false);
    }
  }

  async function loadSavedReport(id) {
    setLoadingReportId(id);
    setStatus("");
    setReportError("");
    try {
      const res = await fetch(`/api/gbp/review-reports/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load report");
      const saved = data.report;
      const loadedFromSnapshot = hydrateSavedReport(saved);
      if (loadedFromSnapshot) setLoadingReportId("");
    } catch (err) {
      setReportError(err.message);
      setLoadingReportId("");
    }
  }

  async function deleteSavedReport(id) {
    if (!confirm("Delete this saved review report? This frees the database space used by this report.")) return;
    setDeletingReportId(id);
    setStatus("");
    setReportError("");
    try {
      const res = await fetch(`/api/gbp/review-reports/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete report");
      setReports((prev) => prev.filter((report) => report.id !== id));
      setActiveReportTitle((prev) => {
        const deleted = reports.find((report) => report.id === id);
        return deleted?.title === prev ? "" : prev;
      });
      setActiveReportId((prev) => (prev === id ? "" : prev));
      setStatus("Report deleted.");
    } catch (err) {
      setReportError(err.message);
    } finally {
      setDeletingReportId("");
    }
  }

  function exportCsv() {
    const rows = currentExportRows;
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `google-reviews-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function buildExportRows() {
    const locationLabels = selectedLocations.map((location) => location.display_name);
    const byLocation = (getValue) => selectedLocations.map((location) => getValue(location.location_name));
    return [
      ["Google Reviews"],
      [monthLabel(startDate)],
      [`${formatReportDate(startDate)}-${formatReportDate(endDate)}`],
      ["Criteria & Location", ...locationLabels],
      ["Cosmetics.lk Customers", ...byLocation((name) => manual("cosmeticsCustomers", name))],
      ["SupplementVault Customers", ...byLocation((name) => manual("supplementCustomers", name))],
      ["Total Customers", ...byLocation((name) => displayNumber(totalCustomers(name)))],
      ["Total Reviews last Month", ...byLocation((name) => displayNumber(report.metrics[name]?.lastMonth))],
      ["Total Reviews as of now", ...byLocation((name) => displayNumber(report.metrics[name]?.asOfNow))],
      ["Total Reviews Collected", ...byLocation((name) => displayNumber(report.metrics[name]?.collected))],
      ["Manually Calculated Reviews", ...byLocation((name) => displayNumber(report.metrics[name]?.manualCount))],
      ["No of Deleted Reviews", ...byLocation((name) => displayNumber(report.metrics[name]?.deleted))],
      ["Conversion Rate", ...byLocation((name) => formatPercent(conversionRate(name)))],
      ["Monthly Target", ...byLocation(() => "25%")],
      [],
      [],
      [monthLabel(startDate)],
      [`${formatReportDate(startDate)}-${formatReportDate(endDate)}`],
      ["Criteria & Location", ...locationLabels],
      ["Manually Calculated Reviews", ...byLocation((name) => displayNumber(report.metrics[name]?.manualCount))],
      ["Ratings", ...byLocation((name) => formatRating(performanceMetric(name, "rating")))],
      ["Google Search - Mobile", ...byLocation((name) => displayNumber(performanceMetric(name, "googleSearchMobile")))],
      ["Google Search - Desktop", ...byLocation((name) => displayNumber(performanceMetric(name, "googleSearchDesktop")))],
      ["Google Maps - Mobile", ...byLocation((name) => displayNumber(performanceMetric(name, "googleMapsMobile")))],
      ["Google Maps - Desktop", ...byLocation((name) => displayNumber(performanceMetric(name, "googleMapsDesktop")))],
      ["Calls", ...byLocation((name) => displayNumber(performanceMetric(name, "calls")))],
      ["Chat Clicks", ...byLocation((name) => displayNumber(chatClicks(name)))],
      ["Directions", ...byLocation((name) => displayNumber(performanceMetric(name, "directions")))],
      ["Website clicks", ...byLocation((name) => displayNumber(performanceMetric(name, "websiteClicks")))],
      ["Engagement per 100 views", ...byLocation((name) => formatPercent(engagementPer100Views(name)))],
    ];
  }

  const computedValues = buildComputedValues();
  const currentExportRows = buildExportRows();
  const invalidRange = startDate && endDate && startOfInputDate(startDate) > startOfInputDate(endDate);
  const missingSelectedCount = [...selected].filter((locationName) => !locations.some((location) => location.location_name === locationName)).length;
  const reportBuilt = !counterLoading && selectedLocations.length > 0 && selectedLocations.every((location) =>
    Object.prototype.hasOwnProperty.call(reviewCounts, location.location_name)
  );
  const reportReady = reportBuilt && !counterError;
  const reportBuilding = selectedLocations.length > 0 && !invalidRange && !reportReady;


  useEffect(() => {
    if (loadingReportId && !counterLoading && (reportReady || counterError)) {
      setLoadingReportId("");
      if (reportReady && activeReportTitle) setStatus(`Loaded ${activeReportTitle}.`);
    }
  }, [activeReportTitle, counterError, counterLoading, loadingReportId, reportReady]);

  useEffect(() => {
    if (!activeReportId || !reportReady || savedSnapshotKey) return;

    async function updateSnapshot() {
      try {
        const res = await fetch(`/api/gbp/review-reports/${activeReportId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manualValues,
            computedValues,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to update saved report");
        const snapshotKey = reportSelectionKey;
        savedSnapshotKeyRef.current = snapshotKey;
        setSavedSnapshotKey(snapshotKey);
        setReports((prev) => prev.map((report) => report.id === activeReportId ? data.report : report));
        setStatus(`Loaded ${data.report.title}.`);
      } catch (err) {
        setReportError(err.message);
      }
    }

    updateSnapshot();
  }, [activeReportId, computedValues, manualValues, reportReady, reportSelectionKey, savedSnapshotKey]);

  return (
    <div className="px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2b4a]">Review Counter</h1>
          <p className="text-sm text-slate-500 mt-1">Spreadsheet-style Google review count report.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={loading || invalidRange || !reportReady}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-200 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={saveReportRun}
            disabled={loading || savingReport || invalidRange || !reportReady}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {reportBuilding ? "Building report..." : savingReport ? "Saving..." : "Run / Save Report"}
          </button>
        </div>
      </div>

      {(status || reportError) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${reportError ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {reportError || status}
        </div>
      )}

      {reportBuilding && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
          Building report...
        </div>
      )}

      {activeReportTitle && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Active report: <span className="font-semibold">{activeReportTitle}</span>
          {missingSelectedCount > 0 && (
            <span className="ml-2 text-amber-700">
              {missingSelectedCount} saved profile{missingSelectedCount === 1 ? "" : "s"} no longer enabled.
            </span>
          )}
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-xl px-5 py-4">
        <div className="grid gap-4 md:grid-cols-[220px_220px_1fr]">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Start Date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => { savedSnapshotKeyRef.current = ""; setSavedSnapshotKey(""); setStartDate(event.target.value); }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">End Date</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => { savedSnapshotKeyRef.current = ""; setSavedSnapshotKey(""); setEndDate(event.target.value); }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <div className="flex flex-wrap items-end justify-end gap-2">
            <button onClick={loadReviewCounts} disabled={counterLoading || invalidRange} className="text-xs font-medium text-emerald-600 hover:text-emerald-800 underline disabled:text-slate-300">
              {counterLoading ? "Counting reviews..." : "Refresh review counts"}
            </button>
            <span className="text-xs text-slate-300">|</span>
            <button onClick={selectAll} disabled={counterLoading} className="text-xs font-medium text-sky-600 hover:text-sky-800 underline disabled:text-slate-300">Select all profiles</button>
            <span className="text-xs text-slate-300">|</span>
            <button onClick={clearSelection} disabled={counterLoading} className="text-xs font-medium text-slate-500 hover:text-slate-700 underline disabled:text-slate-300">Clear profiles</button>
          </div>
        </div>
        {invalidRange && <p className="mt-3 text-xs font-medium text-rose-600">Start date must be before or equal to end date.</p>}
        {counterError && <p className="mt-3 text-xs font-medium text-amber-700">{counterError}</p>}
      </section>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <p className="text-sm font-medium text-red-700">Error</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      ) : loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading GBP profiles...</div>
      ) : locations.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">No enabled GBP profiles found.</p>
          <p className="text-xs mt-2">Enable profiles from <Link href="/gbp/connect" className="text-sky-500 underline">GBP Connect</Link>.</p>
        </div>
      ) : (
        <>
          <section className="bg-white border border-slate-200 rounded-xl px-5 py-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {locations.map((location) => (
                <label key={location.location_name} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer hover:border-sky-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={selected.has(location.location_name)}
                    onChange={() => toggleLocation(location.location_name)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-700 truncate">{location.display_name}</span>
                    <span className="block text-[11px] text-slate-400 truncate">{location.google_email}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Previous Reports</h2>
                <p className="text-xs text-slate-400 mt-0.5">Load stored manual counts or delete old report snapshots.</p>
              </div>
              <button onClick={loadReports} disabled={reportsLoading} className="text-xs font-medium text-sky-600 hover:text-sky-800 underline disabled:text-slate-300">
                {reportsLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            {reportsLoading ? (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">Loading reports...</p>
            ) : reports.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">No saved review reports yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Report</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date Range</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Profiles</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Saved</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports.map((savedReport) => (
                      <tr key={savedReport.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{savedReport.title}</td>
                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{formatReportDate(savedReport.startDate)}-{formatReportDate(savedReport.endDate)}</td>
                        <td className="px-5 py-3 text-slate-500">{savedReport.locations?.length ?? 0}</td>
                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{formatSavedAt(savedReport.createdAt)}</td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => loadSavedReport(savedReport.id)}
                              disabled={Boolean(loadingReportId) || counterLoading || reportBuilding}
                              className="text-xs font-semibold text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {loadingReportId === savedReport.id ? "Loading..." : counterLoading ? "Building..." : "Load"}
                            </button>
                            <button
                              onClick={() => deleteSavedReport(savedReport.id)}
                              disabled={deletingReportId === savedReport.id || counterLoading || reportBuilding}
                              className="text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {deletingReportId === savedReport.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto p-3">
              <table className="border-collapse text-base text-black">
                <caption className="caption-top text-left pb-1">
                  <div className="font-bold">Google Reviews</div>
                  <div className="font-bold">{monthLabel(startDate)}</div>
                  <div className="font-bold">{formatReportDate(startDate)}-{formatReportDate(endDate)}</div>
                </caption>
                <thead>
                  <tr>
                    <th className="border border-black bg-sky-100 px-1.5 py-0.5 text-left font-bold min-w-55">Criteria &amp; Location</th>
                    {selectedLocations.map((location) => (
                      <th key={location.location_name} className="border border-black bg-sky-100 px-1.5 py-0.5 text-right font-bold whitespace-nowrap min-w-24">{location.display_name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">Cosmetics.lk Customers</th>
                    {selectedLocations.map((location) => (
                      <EditableCell key={location.location_name} value={manual("cosmeticsCustomers", location.location_name)} onChange={(value) => updateManual("cosmeticsCustomers", location.location_name, value)} className="bg-neutral-100" />
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">SupplementVault Customers</th>
                    {selectedLocations.map((location) => (
                      <EditableCell key={location.location_name} value={manual("supplementCustomers", location.location_name)} onChange={(value) => updateManual("supplementCustomers", location.location_name, value)} className="bg-neutral-100" />
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">Total Customers</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums">{displayNumber(totalCustomers(location.location_name))}</td>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">Total Reviews last Month</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums">{counterLoading ? "..." : displayNumber(report.metrics[location.location_name]?.lastMonth)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">Total Reviews as of now</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums">{counterLoading ? "..." : displayNumber(report.metrics[location.location_name]?.asOfNow)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">Total Reviews Collected</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums">
                        {counterLoading ? "..." : displayNumber(report.metrics[location.location_name]?.collected)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-green-300 px-1.5 py-0.5 text-left font-normal">Manually Calculated Reviews</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black bg-green-300 px-1.5 py-0.5 text-right tabular-nums font-bold">{counterLoading ? "..." : displayNumber(report.metrics[location.location_name]?.manualCount)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal text-red-600">No of Deleted Reviews</th>
                    {selectedLocations.map((location) => {
                      const deleted = report.metrics[location.location_name]?.deleted;
                      return <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums text-red-600">{displayNumber(deleted)}</td>;
                    })}
                  </tr>
                  <tr>
                    <th className="border border-black bg-yellow-300 px-1.5 py-0.5 text-left font-normal">Conversion Rate</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black bg-yellow-300 px-1.5 py-0.5 text-right tabular-nums">{formatPercent(conversionRate(location.location_name))}</td>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">Monthly Target</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums">25%</td>
                    ))}
                  </tr>
                  <tr><td className="h-6" colSpan={selectedLocations.length + 1}></td></tr>
                  <tr><td className="h-6" colSpan={selectedLocations.length + 1}></td></tr>
                  <tr>
                    <th className="border border-black px-1.5 py-0.5 text-left font-bold">{monthLabel(startDate)}</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black px-1.5 py-0.5"></td>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black px-1.5 py-0.5 text-left font-bold">{formatReportDate(startDate)}-{formatReportDate(endDate)}</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black px-1.5 py-0.5"></td>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-sky-100 px-1.5 py-0.5 text-left font-bold min-w-55">Criteria &amp; Location</th>
                    {selectedLocations.map((location) => (
                      <th key={location.location_name} className="border border-black bg-sky-100 px-1.5 py-0.5 text-right font-bold whitespace-nowrap min-w-24">{location.display_name}</th>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">Manually Calculated Reviews</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black bg-green-300 px-1.5 py-0.5 text-right tabular-nums font-bold">{counterLoading ? "..." : displayNumber(report.metrics[location.location_name]?.manualCount)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">Ratings</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums">{counterLoading ? "..." : formatRating(performanceMetric(location.location_name, "rating"))}</td>
                    ))}
                  </tr>
                  {[
                    ["Google Search - Mobile", "googleSearchMobile"],
                    ["Google Search - Desktop", "googleSearchDesktop"],
                    ["Google Maps - Mobile", "googleMapsMobile"],
                    ["Google Maps - Desktop", "googleMapsDesktop"],
                    ["Calls", "calls"],
                  ].map(([label, metric]) => (
                    <tr key={metric}>
                      <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">{label}</th>
                      {selectedLocations.map((location) => (
                        <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums">{counterLoading ? "..." : displayNumber(performanceMetric(location.location_name, metric))}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">Chat Clicks</th>
                    {selectedLocations.map((location) => {
                      const googleValue = performanceMetric(location.location_name, "chatClicks");
                      return googleValue !== null ? (
                        <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums">{counterLoading ? "..." : displayNumber(googleValue)}</td>
                      ) : (
                        <EditableCell key={location.location_name} value={manual("chatClicks", location.location_name)} onChange={(value) => updateManual("chatClicks", location.location_name, value)} className="bg-neutral-100" />
                      );
                    })}
                  </tr>
                  {[
                    ["Directions", "directions"],
                    ["Website clicks", "websiteClicks"],
                  ].map(([label, metric]) => (
                    <tr key={metric}>
                      <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">{label}</th>
                      {selectedLocations.map((location) => (
                        <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums">{counterLoading ? "..." : displayNumber(performanceMetric(location.location_name, metric))}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th className="border border-black bg-neutral-100 px-1.5 py-0.5 text-left font-normal">Engagement per 100 views</th>
                    {selectedLocations.map((location) => (
                      <td key={location.location_name} className="border border-black bg-neutral-100 px-1.5 py-0.5 text-right tabular-nums">{counterLoading ? "..." : formatPercent(engagementPer100Views(location.location_name))}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
