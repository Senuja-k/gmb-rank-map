"use client";

import { useState } from "react";
import LocationPicker from "@/components/LocationPicker";

export default function ReviewsPage() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [reviewId, setReviewId] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewText, setReviewText] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/gbp/reviews/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: selectedLocation?.email,
          locationName: selectedLocation?.locationName,
          reviewId,
          reviewerName,
          reviewText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1a2b4a]">AI Review Responder</h1>
        <p className="text-sm text-slate-500 mt-1">
          Paste a customer review and Gemini will generate a professional reply and post it to Google.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Location picker */}
        <LocationPicker value={selectedLocation} onChange={setSelectedLocation} />

        {/* Review ID */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Review Resource Name
          </label>
          <input
            type="text"
            value={reviewId}
            onChange={(e) => setReviewId(e.target.value)}
            placeholder="accounts/123/locations/456/reviews/AbCdEf"
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* Reviewer name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Reviewer Name
          </label>
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Jane Doe"
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* Review text */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Review Text
          </label>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Great selection of skincare products! The staff was very helpful…"
            required
            rows={4}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? "Generating & Posting Reply…" : "Generate AI Reply & Post to Google"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-700">Error</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
          <p className="text-sm font-semibold text-green-800">Reply posted successfully!</p>
          <div className="bg-white border border-green-100 rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">AI-Generated Reply</p>
            <p className="text-sm text-slate-700 leading-relaxed">{result.aiReply}</p>
          </div>
        </div>
      )}
    </div>
  );
}
