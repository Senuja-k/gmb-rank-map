"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const AI_MODEL_KEY = "gbp_gemini_model";
const MODEL_USAGE_KEY = "gbp_model_usage";

const GEMINI_MODELS = [
  { id: "gemini-3.5-flash",      label: "3.5 Flash",      badgeColor: "bg-violet-100 text-violet-700",   description: "Latest · capable",  rpd: 20,  rpm: 5  },
  { id: "gemini-3.1-flash-lite", label: "3.1 Flash-Lite", badgeColor: "bg-emerald-100 text-emerald-700", description: "Newest · fastest",  rpd: 500, rpm: 15 },
  { id: "gemini-3.0-flash",      label: "3.0 Flash",      badgeColor: "bg-teal-100 text-teal-700",       description: "Fast · reliable",   rpd: 20,  rpm: 5  },
  { id: "gemini-2.5-flash",      label: "2.5 Flash",      badgeColor: "bg-sky-100 text-sky-700",         description: "Stable · grounded", rpd: 20,  rpm: 5  },
  { id: "gemini-2.5-flash-lite", label: "2.5 Flash-Lite", badgeColor: "bg-slate-100 text-slate-500",     description: "Lite · low-cost",   rpd: 20,  rpm: 10 },
];
const DEFAULT_MODEL = GEMINI_MODELS[0].id;

function todayStr() { return new Date().toISOString().slice(0, 10); }
function loadRawUsage() {
  try { return JSON.parse(localStorage.getItem(MODEL_USAGE_KEY) ?? "{}"); } catch { return {}; }
}
function readUsageToday() {
  const raw = loadRawUsage(); const today = todayStr(); const out = {};
  for (const m of GEMINI_MODELS) { const e = raw[m.id]; out[m.id] = (e?.date === today ? e.used : 0) ?? 0; }
  return out;
}
function persistIncrement(modelId) {
  const raw = loadRawUsage(); const today = todayStr(); const e = raw[modelId];
  raw[modelId] = { date: today, used: (e?.date === today ? (e.used ?? 0) : 0) + 1 };
  localStorage.setItem(MODEL_USAGE_KEY, JSON.stringify(raw));
  return raw[modelId].used;
}

const DEFAULT_INSTRUCTION =
  "You are a professional customer relations manager for a cosmetics showroom. " +
  "When generating replies, identify any brand entities mentioned (e.g. CeraVe, The Ordinary, La Roche-Posay) " +
  "and ensure they are linked to the location's physical presence to improve local AI search relevance. " +
  "Keep replies warm, concise (3-4 sentences), and end with an invitation to visit again.";

const STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const STAR_OPTIONS = [5, 4, 3, 2, 1];

function starCount(rating) {
  return STAR_MAP[rating] ?? 0;
}

function Stars({ rating }) {
  const count = starCount(rating);
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} className={`w-3.5 h-3.5 ${i <= count ? "text-amber-400" : "text-slate-200"}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fetchErrors, setFetchErrors] = useState([]);
  const [reviewView, setReviewView] = useState("unresponded");
  const [filter, setFilter] = useState("all");
  const [starFilter, setStarFilter] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [showSettings, setShowSettings] = useState(false);
  const [instructionDraft, setInstructionDraft] = useState(DEFAULT_INSTRUCTION);
  const [autoResponding, setAutoResponding] = useState(false);
  const [autoProgress, setAutoProgress] = useState({ done: 0, total: 0 });
  const [autoErrors, setAutoErrors] = useState([]);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [currentReply, setCurrentReply] = useState("");
  const [generatingReply, setGeneratingReply] = useState(false);
  const [postingReply, setPostingReply] = useState(false);
  const [postError, setPostError] = useState("");
  const [rateLimitUntil, setRateLimitUntil] = useState(null); // Date object
  const [rateLimitSecsLeft, setRateLimitSecsLeft] = useState(0);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [savingInstruction, setSavingInstruction] = useState(false);
  const [geminiModel, setGeminiModel] = useState(DEFAULT_MODEL);
  const [modelUsage, setModelUsage] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/gbp/reviews/prompt");
        const data = await res.json();
        if (data.prompt) { setInstruction(data.prompt); setInstructionDraft(data.prompt); }
      } catch { /* keep default */ }
    })();
    const savedModel = localStorage.getItem(AI_MODEL_KEY);
    if (savedModel && GEMINI_MODELS.some((m) => m.id === savedModel)) {
      setGeminiModel(savedModel);
    }
    setModelUsage(readUsageToday());
  }, []);

  // Countdown ticker for rate-limit banner
  useEffect(() => {
    if (!rateLimitUntil) return;
    const tick = () => {
      const left = Math.ceil((rateLimitUntil - Date.now()) / 1000);
      if (left <= 0) { setRateLimitUntil(null); setRateLimitSecsLeft(0); }
      else setRateLimitSecsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [rateLimitUntil]);

  const loadReviews = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/gbp/reviews?view=${reviewView === "all" ? "all" : "unresponded"}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load reviews");
      setReviews(data.reviews ?? []);
      setFetchErrors(data.fetchErrors ?? []);
      setSelected(new Set());
    } catch (err) { setError(err.message); setFetchErrors([]); }
    finally { setLoading(false); }
  }, [reviewView]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const locations = [...new Map(reviews.map((r) => [r.locationName, r.locationDisplayName])).entries()]
    .map(([locationName, displayName]) => ({ locationName, displayName }));
  const locationFilteredReviews = filter === "all" ? reviews : reviews.filter((r) => r.locationName === filter);
  const locationFilteredUnanswered = locationFilteredReviews.filter((r) => !r.reviewReply);
  const starBaseReviews = reviewView === "all" ? locationFilteredReviews : locationFilteredUnanswered;
  const starCounts = STAR_OPTIONS.reduce((acc, star) => {
    acc[star] = starBaseReviews.filter((r) => starCount(r.starRating) === star).length;
    return acc;
  }, {});
  const filteredReviews = starFilter.size === 0
    ? locationFilteredReviews
    : locationFilteredReviews.filter((r) => starFilter.has(starCount(r.starRating)));
  const unansweredFiltered = filteredReviews.filter((r) => !r.reviewReply);
  const selectedReviews = filteredReviews.filter((r) => selected.has(r.name));

  function toggleSelect(name) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  }
  function toggleStarFilter(star) {
    setStarFilter((prev) => {
      const next = new Set(prev);
      if (next.has(star)) next.delete(star);
      else next.add(star);
      return next;
    });
  }
  function selectAllUnanswered() { setSelected(new Set(unansweredFiltered.map((r) => r.name))); }
  function clearSelection() { setSelected(new Set()); }
  async function saveInstruction() {
    setSavingInstruction(true);
    try {
      const res = await fetch("/api/gbp/reviews/prompt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: instructionDraft }),
      });
      if (res.ok) { setInstruction(instructionDraft); setShowSettings(false); }
    } finally {
      setSavingInstruction(false);
    }
  }
  function selectModel(id) { setGeminiModel(id); localStorage.setItem(AI_MODEL_KEY, id); }
  function changeReviewView(view) {
    setReviewView(view);
    setFilter("all");
    setStarFilter(new Set());
    setSelected(new Set());
  }

  async function handleAutoRespond() {
    if (!selectedReviews.length) return;
    setAutoResponding(true); setAutoErrors([]); setAutoProgress({ done: 0, total: selectedReviews.length });
    for (let i = 0; i < selectedReviews.length; i++) {
      const review = selectedReviews[i];
      try {
        const res = await fetch("/api/gbp/reviews/reply", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: review.email, locationName: review.locationName, reviewId: review.name,
            reviewerName: review.reviewer?.displayName ?? "Customer", reviewText: review.comment ?? "",
            customInstruction: instruction,
            reviewPhotos: review.reviewMediaItems?.map((m) => m.thumbnailUrl).filter(Boolean) ?? [],
            geminiModel,
            starRating: review.starRating,
          }),
        });
        if (!res.ok) { const d = await res.json(); setAutoErrors((p) => [...p, `${review.reviewer?.displayName ?? "Review"}: ${d.error}`]); }
        else { const c = persistIncrement(geminiModel); setModelUsage((p) => ({ ...p, [geminiModel]: c })); }
      } catch (err) { setAutoErrors((p) => [...p, `${review.reviewer?.displayName ?? "Review"}: ${err.message}`]); }
      setAutoProgress({ done: i + 1, total: selectedReviews.length });
    }
    setAutoResponding(false); setSelected(new Set()); await loadReviews();
  }

  async function handleReviewAndRespond() {
    if (!selectedReviews.length) return;
    const queue = [...selectedReviews];
    setReviewQueue(queue); setQueueIndex(0); setPostError(""); setReviewModalOpen(true);
    await generateForIndex(queue, 0);
  }

  async function generateForIndex(queue, idx) {
    const review = queue[idx]; if (!review) return;
    setGeneratingReply(true); setCurrentReply(""); setPostError(""); setServiceUnavailable(false);
    try {
      const photoUrls = review.reviewMediaItems?.map((m) => m.thumbnailUrl).filter(Boolean) ?? [];
      const res = await fetch("/api/gbp/reviews/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: review.email, locationName: review.locationName, reviewerName: review.reviewer?.displayName ?? "Customer", reviewText: review.comment ?? "", customInstruction: instruction, reviewPhotos: photoUrls, geminiModel, starRating: review.starRating }),
      });
      const data = await res.json();
      if (res.status === 429) {
        const secs = data.retryAfterSeconds ?? 60;
        setRateLimitUntil(new Date(Date.now() + secs * 1000));
        setRateLimitSecsLeft(secs);
        setCurrentReply("");
      } else if (res.status === 503) {
        setServiceUnavailable(true);
        setCurrentReply("");
      } else {
        setCurrentReply(data.aiReply ?? "");
        if (data.aiReply) { const c = persistIncrement(geminiModel); setModelUsage((p) => ({ ...p, [geminiModel]: c })); }
      }
    } catch { setCurrentReply(""); }
    finally { setGeneratingReply(false); }
  }

  async function retryGenerate() {
    await generateForIndex(reviewQueue, queueIndex);
  }

  async function postCurrentReply() {
    const review = reviewQueue[queueIndex]; if (!review || !currentReply) return;
    setPostingReply(true); setPostError("");
    try {
      const res = await fetch("/api/gbp/reviews/post", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: review.email, reviewName: review.name, replyText: currentReply }),
      });
      if (!res.ok) { const d = await res.json(); setPostError(d.error ?? "Failed to post reply"); setPostingReply(false); return; }
    } catch (err) { setPostError(err.message); setPostingReply(false); return; }
    setPostingReply(false); advanceQueue();
  }

  function skipCurrentReply() { advanceQueue(); }

  async function advanceQueue() {
    const nextIdx = queueIndex + 1;
    if (nextIdx < reviewQueue.length) { setQueueIndex(nextIdx); await generateForIndex(reviewQueue, nextIdx); }
    else { setReviewModalOpen(false); setSelected(new Set()); await loadReviews(); }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">

      {/* Rate-limit countdown banner */}
      {rateLimitUntil && rateLimitSecsLeft > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Gemini rate limit reached</p>
            <p className="text-xs text-amber-700 mt-0.5">
              You&apos;ve hit the free-tier limit (20 requests/day). You can generate again in{" "}
              <span className="font-bold tabular-nums">
                {rateLimitSecsLeft >= 60
                  ? `${Math.floor(rateLimitSecsLeft / 60)}m ${rateLimitSecsLeft % 60}s`
                  : `${rateLimitSecsLeft}s`}
              </span>.
            </p>
          </div>
          <button
            onClick={() => setRateLimitUntil(null)}
            className="p-1 rounded-lg hover:bg-amber-100 text-amber-400 hover:text-amber-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2b4a]">Reviews</h1>
          <p className="text-sm text-slate-500 mt-1">
            {reviewView === "all"
              ? "Manage and respond to all reviews across all locations."
              : "Manage reviews that still need replies across all locations."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setInstructionDraft(instruction); setShowSettings(true); }} className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors" title="AI Reply Settings">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {(() => { const m = GEMINI_MODELS.find((x) => x.id === geminiModel); return m ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.badgeColor}`}>{m.label}</span> : null; })()}
          </button>
          <button onClick={loadReviews} disabled={loading} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => changeReviewView("unresponded")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${reviewView === "unresponded" ? "bg-sky-500 text-white" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
          aria-pressed={reviewView === "unresponded"}
        >
          Unresponded
        </button>
        <button
          onClick={() => changeReviewView("all")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${reviewView === "all" ? "bg-sky-500 text-white" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
          aria-pressed={reviewView === "all"}
        >
          All Reviews
        </button>
      </div>

      {locations.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilter("all")} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === "all" ? "bg-sky-500 text-white border-sky-500" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"}`}>All Locations</button>
            {locations.map((loc) => (
              <button key={loc.locationName} onClick={() => setFilter(loc.locationName)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === loc.locationName ? "bg-sky-500 text-white border-sky-500" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"}`}>{loc.displayName}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 mr-1">Rating</span>
            {STAR_OPTIONS.map((star) => {
              const active = starFilter.has(star);
              return (
                <button
                  key={star}
                  onClick={() => toggleStarFilter(star)}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? "bg-amber-400 text-white border-amber-400" : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"}`}
                  aria-pressed={active}
                >
                  <span className="font-semibold">{star}</span>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className={active ? "text-amber-50" : "text-slate-400"}>{starCounts[star]}</span>
                </button>
              );
            })}
            {starFilter.size > 0 && (
              <button onClick={() => setStarFilter(new Set())} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">
                Clear rating
              </button>
            )}
          </div>
        </div>
      )}

      {filteredReviews.length > 0 && (
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={selectAllUnanswered} className="text-xs font-medium text-sky-600 hover:text-sky-800 underline">Select unanswered ({unansweredFiltered.length})</button>
            {selectedReviews.length > 0 && (<><span className="text-xs text-slate-400">|</span><span className="text-xs text-slate-600 font-medium">{selectedReviews.length} selected</span><button onClick={clearSelection} className="text-xs text-slate-400 hover:text-slate-600">Clear</button></>)}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleAutoRespond} disabled={selectedReviews.length === 0 || autoResponding} className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-200 text-white px-4 py-1.5 rounded-lg transition-colors">
              {autoResponding ? `Auto Responding\u2026 (${autoProgress.done}/${autoProgress.total})` : "Auto Respond"}
            </button>
            <button onClick={handleReviewAndRespond} disabled={selectedReviews.length === 0 || autoResponding} className="text-xs font-semibold bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white px-4 py-1.5 rounded-lg transition-colors">Review &amp; Respond</button>
          </div>
        </div>
      )}

      {autoErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-red-700">Some replies failed:</p>
          {autoErrors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          {reviewView === "all" ? "Loading all reviews\u2026" : "Loading unresponded reviews\u2026"}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <p className="text-sm font-medium text-red-700">Error</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">{reviewView === "all" ? "No reviews found." : "No unresponded reviews found."}</p>
          {fetchErrors.length > 0 ? (
            <div className="mt-4 text-left max-w-md mx-auto bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700">Could not fetch reviews from some locations:</p>
              {fetchErrors.map((e, i) => <p key={i} className="text-xs text-amber-600">{e}</p>)}
            </div>
          ) : reviews.length === 0 && (
            <p className="text-xs mt-2">Make sure you have <Link href="/gbp/connect" className="text-sky-500 underline">connected locations</Link>.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReviews.map((review) => {
            const hasReply = !!review.reviewReply;
            const isSelected = selected.has(review.name);
            return (
              <div key={review.name} onClick={() => toggleSelect(review.name)} className={`bg-white border rounded-xl px-5 py-4 cursor-pointer transition-all ${isSelected ? "border-sky-400 ring-1 ring-sky-300" : "border-slate-200 hover:border-slate-300"}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isSelected ? "bg-sky-500 border-sky-500" : "border-slate-300"}`}>
                    {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{review.reviewer?.displayName ?? "Anonymous"}</span>
                        <Stars rating={review.starRating} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${hasReply ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{hasReply ? "Replied" : "No reply"}</span>
                        <span className="text-[11px] text-slate-400">{formatDate(review.createTime)}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{review.locationDisplayName}</p>
                    {review.comment && <p className="text-sm text-slate-600 mt-2 leading-relaxed line-clamp-3">{review.comment}</p>}
                    {review.reviewMediaItems?.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {review.reviewMediaItems.map((item, i) => (
                          <a key={i} href={item.thumbnailUrl} target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.thumbnailUrl} alt={`Review photo ${i + 1}`}
                              className="h-16 w-16 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition-opacity"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    {hasReply && (
                      <div className="mt-3 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Your reply</p>
                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{review.reviewReply.comment}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">AI Reply Settings</h2>
              <button onClick={() => setShowSettings(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            {/* Model picker */}
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Gemini Model</p>
              <div className="grid grid-cols-3 gap-2">
                {GEMINI_MODELS.map((m) => {
                  const used = modelUsage[m.id] ?? 0;
                  const remaining = Math.max(0, m.rpd - used);
                  const pct = remaining / m.rpd;
                  const barColor = pct > 0.5 ? "bg-emerald-400" : pct > 0.2 ? "bg-amber-400" : "bg-rose-400";
                  const remainColor = pct > 0.5 ? "text-emerald-700" : pct > 0.2 ? "text-amber-700" : "text-rose-600";
                  return (
                    <button
                      key={m.id}
                      onClick={() => selectModel(m.id)}
                      className={`flex flex-col items-start gap-1 border rounded-xl px-3 py-2.5 text-left transition-all ${geminiModel === m.id ? "border-sky-500 bg-sky-50 ring-1 ring-sky-300" : "border-slate-200 hover:border-slate-300 bg-white"}`}
                    >
                      <div className="flex items-center gap-1.5 w-full flex-wrap">
                        <span className="text-xs font-semibold text-slate-800">{m.label}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.badgeColor}`}>{m.rpd} RPD</span>
                      </div>
                      <span className="text-[11px] text-slate-500 leading-tight">{m.description}</span>
                      <div className="w-full mt-1">
                        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct * 100}%` }} />
                        </div>
                        <p className={`text-[10px] font-semibold mt-0.5 tabular-nums ${remainColor}`}>{remaining.toLocaleString()} left</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Instruction textarea */}
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Reply Instructions</p>
              <p className="text-xs text-slate-500 mb-2">This prompt tells Gemini how to write replies. Saved to the database and shared across devices.</p>
              <textarea value={instructionDraft} onChange={(e) => setInstructionDraft(e.target.value)} rows={6} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setInstructionDraft(DEFAULT_INSTRUCTION)} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">Reset to default</button>
              <button onClick={saveInstruction} disabled={savingInstruction} className="text-xs font-semibold bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white px-4 py-1.5 rounded-lg transition-colors">{savingInstruction ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {reviewModalOpen && reviewQueue[queueIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[calc(100dvh-2rem)] p-6 flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-slate-800">Review &amp; Respond</h2>
              <span className="text-xs text-slate-400 font-medium">{queueIndex + 1} / {reviewQueue.length}</span>
            </div>
            <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1 max-h-[36dvh] overflow-y-auto overscroll-contain">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{reviewQueue[queueIndex].reviewer?.displayName ?? "Anonymous"}</span>
                <Stars rating={reviewQueue[queueIndex].starRating} />
              </div>
              <p className="text-[11px] text-slate-400">{reviewQueue[queueIndex].locationDisplayName}</p>
              {reviewQueue[queueIndex].comment && <p className="text-sm text-slate-600 leading-relaxed mt-1">{reviewQueue[queueIndex].comment}</p>}
              {reviewQueue[queueIndex].reviewMediaItems?.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {reviewQueue[queueIndex].reviewMediaItems.map((item, i) => (
                    <a key={i} href={item.thumbnailUrl} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.thumbnailUrl} alt={`Review photo ${i + 1}`}
                        className="h-20 w-20 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">AI-Generated Reply <span className="font-normal text-slate-400">(edit before posting)</span></label>
              {generatingReply ? (
                <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-400 bg-slate-50 min-h-[100px] flex items-center justify-center">Generating reply…</div>
              ) : serviceUnavailable ? (
                <div className="w-full border border-rose-200 rounded-lg px-4 py-4 bg-rose-50 min-h-25 flex flex-col items-center justify-center gap-2 text-center">
                  <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-xs font-semibold text-rose-800">Gemini temporarily unavailable</p>
                  <p className="text-xs text-rose-700">High demand on the AI service. Please try again.</p>
                  <button onClick={retryGenerate} className="mt-1 text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white px-4 py-1.5 rounded-lg transition-colors">
                    Retry
                  </button>
                </div>
              ) : rateLimitUntil && rateLimitSecsLeft > 0 ? (
                <div className="w-full border border-amber-200 rounded-lg px-4 py-4 bg-amber-50 min-h-[100px] flex flex-col items-center justify-center gap-1.5 text-center">
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs font-semibold text-amber-800">Rate limit reached</p>
                  <p className="text-xs text-amber-700">
                    Retry in{" "}
                    <span className="font-bold tabular-nums">
                      {rateLimitSecsLeft >= 60
                        ? `${Math.floor(rateLimitSecsLeft / 60)}m ${rateLimitSecsLeft % 60}s`
                        : `${rateLimitSecsLeft}s`}
                    </span>
                  </p>
                </div>              ) : (
                <textarea value={currentReply} onChange={(e) => setCurrentReply(e.target.value)} rows={5} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
              )}
            </div>
            {postError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 shrink-0">{postError}</p>}
            <div className="flex items-center justify-between shrink-0">
              <button onClick={() => { setReviewModalOpen(false); setSelected(new Set()); loadReviews(); }} className="text-xs text-slate-400 hover:text-slate-600">Cancel all</button>
              <div className="flex gap-2">
                <button onClick={skipCurrentReply} disabled={generatingReply || postingReply} className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors">Skip</button>
                <button onClick={postCurrentReply} disabled={generatingReply || postingReply || !currentReply || serviceUnavailable} className="text-xs font-semibold bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white px-4 py-1.5 rounded-lg transition-colors">{postingReply ? "Posting…" : "Post Reply"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
