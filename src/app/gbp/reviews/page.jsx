"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const AI_INSTRUCTION_KEY = "gbp_ai_instruction";
const DEFAULT_INSTRUCTION =
  "You are a professional customer relations manager for a cosmetics showroom. " +
  "When generating replies, identify any brand entities mentioned (e.g. CeraVe, The Ordinary, La Roche-Posay) " +
  "and ensure they are linked to the location's physical presence to improve local AI search relevance. " +
  "Keep replies warm, concise (3-4 sentences), and end with an invitation to visit again.";

const STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function Stars({ rating }) {
  const count = STAR_MAP[rating] ?? 0;
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
  const [filter, setFilter] = useState("all");
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

  useEffect(() => {
    const saved = localStorage.getItem(AI_INSTRUCTION_KEY);
    if (saved) { setInstruction(saved); setInstructionDraft(saved); }
  }, []);

  const loadReviews = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/gbp/reviews");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load reviews");
      setReviews(data.reviews ?? []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const locations = [...new Map(reviews.map((r) => [r.locationName, r.locationDisplayName])).entries()]
    .map(([locationName, displayName]) => ({ locationName, displayName }));
  const filteredReviews = filter === "all" ? reviews : reviews.filter((r) => r.locationName === filter);
  const unansweredFiltered = filteredReviews.filter((r) => !r.reviewReply);
  const selectedReviews = filteredReviews.filter((r) => selected.has(r.name));

  function toggleSelect(name) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  }
  function selectAllUnanswered() { setSelected(new Set(unansweredFiltered.map((r) => r.name))); }
  function clearSelection() { setSelected(new Set()); }
  function saveInstruction() { localStorage.setItem(AI_INSTRUCTION_KEY, instructionDraft); setInstruction(instructionDraft); setShowSettings(false); }

  async function handleAutoRespond() {
    if (!selectedReviews.length) return;
    setAutoResponding(true); setAutoErrors([]); setAutoProgress({ done: 0, total: selectedReviews.length });
    for (let i = 0; i < selectedReviews.length; i++) {
      const review = selectedReviews[i];
      try {
        const res = await fetch("/api/gbp/reviews/reply", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: review.email, locationName: review.locationName, reviewId: review.name, reviewerName: review.reviewer?.displayName ?? "Customer", reviewText: review.comment ?? "", customInstruction: instruction }),
        });
        if (!res.ok) { const d = await res.json(); setAutoErrors((p) => [...p, `${review.reviewer?.displayName ?? "Review"}: ${d.error}`]); }
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
    setGeneratingReply(true); setCurrentReply(""); setPostError("");
    try {
      const res = await fetch("/api/gbp/reviews/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: review.email, locationName: review.locationName, reviewerName: review.reviewer?.displayName ?? "Customer", reviewText: review.comment ?? "", customInstruction: instruction }),
      });
      const data = await res.json(); setCurrentReply(data.aiReply ?? "");
    } catch { setCurrentReply(""); }
    finally { setGeneratingReply(false); }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2b4a]">Reviews</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and respond to reviews across all locations.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setInstructionDraft(instruction); setShowSettings(true); }} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors" title="AI Reply Settings">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button onClick={loadReviews} disabled={loading} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {locations.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilter("all")} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === "all" ? "bg-sky-500 text-white border-sky-500" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"}`}>All Locations</button>
          {locations.map((loc) => (
            <button key={loc.locationName} onClick={() => setFilter(loc.locationName)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === loc.locationName ? "bg-sky-500 text-white border-sky-500" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"}`}>{loc.displayName}</button>
          ))}
        </div>
      )}

      {filteredReviews.length > 0 && (
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={selectAllUnanswered} className="text-xs font-medium text-sky-600 hover:text-sky-800 underline">Select unanswered ({unansweredFiltered.length})</button>
            {selected.size > 0 && (<><span className="text-xs text-slate-400">|</span><span className="text-xs text-slate-600 font-medium">{selected.size} selected</span><button onClick={clearSelection} className="text-xs text-slate-400 hover:text-slate-600">Clear</button></>)}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleAutoRespond} disabled={selected.size === 0 || autoResponding} className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-200 text-white px-4 py-1.5 rounded-lg transition-colors">
              {autoResponding ? `Auto Responding\u2026 (${autoProgress.done}/${autoProgress.total})` : "Auto Respond"}
            </button>
            <button onClick={handleReviewAndRespond} disabled={selected.size === 0 || autoResponding} className="text-xs font-semibold bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white px-4 py-1.5 rounded-lg transition-colors">Review &amp; Respond</button>
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
        <div className="text-center py-16 text-slate-400 text-sm">Loading reviews\u2026</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <p className="text-sm font-medium text-red-700">Error</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">No reviews found.</p>
          {reviews.length === 0 && <p className="text-xs mt-2">Make sure you have <Link href="/gbp/connect" className="text-sky-500 underline">connected locations</Link>.</p>}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">AI Reply Instructions</h2>
              <button onClick={() => setShowSettings(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <p className="text-xs text-slate-500">This prompt tells Gemini how to write replies. It&apos;s saved in your browser.</p>
            <textarea value={instructionDraft} onChange={(e) => setInstructionDraft(e.target.value)} rows={6} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setInstructionDraft(DEFAULT_INSTRUCTION)} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">Reset to default</button>
              <button onClick={saveInstruction} className="text-xs font-semibold bg-sky-500 hover:bg-sky-600 text-white px-4 py-1.5 rounded-lg transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}

      {reviewModalOpen && reviewQueue[queueIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Review &amp; Respond</h2>
              <span className="text-xs text-slate-400 font-medium">{queueIndex + 1} / {reviewQueue.length}</span>
            </div>
            <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{reviewQueue[queueIndex].reviewer?.displayName ?? "Anonymous"}</span>
                <Stars rating={reviewQueue[queueIndex].starRating} />
              </div>
              <p className="text-[11px] text-slate-400">{reviewQueue[queueIndex].locationDisplayName}</p>
              {reviewQueue[queueIndex].comment && <p className="text-sm text-slate-600 leading-relaxed mt-1">{reviewQueue[queueIndex].comment}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">AI-Generated Reply <span className="font-normal text-slate-400">(edit before posting)</span></label>
              {generatingReply ? (
                <div className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-400 bg-slate-50 min-h-[100px] flex items-center justify-center">Generating reply\u2026</div>
              ) : (
                <textarea value={currentReply} onChange={(e) => setCurrentReply(e.target.value)} rows={5} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
              )}
            </div>
            {postError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{postError}</p>}
            <div className="flex items-center justify-between">
              <button onClick={() => { setReviewModalOpen(false); setSelected(new Set()); loadReviews(); }} className="text-xs text-slate-400 hover:text-slate-600">Cancel all</button>
              <div className="flex gap-2">
                <button onClick={skipCurrentReply} disabled={generatingReply || postingReply} className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors">Skip</button>
                <button onClick={postCurrentReply} disabled={generatingReply || postingReply || !currentReply} className="text-xs font-semibold bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white px-4 py-1.5 rounded-lg transition-colors">{postingReply ? "Posting\u2026" : "Post Reply"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
