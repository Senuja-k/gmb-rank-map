"use client";

import { useState } from "react";
import LocationPicker from "@/components/LocationPicker";

export default function PostsPage() {
  const [mode, setMode] = useState("generate"); // "generate" | "manual"

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [topic, setTopic] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError("");

    const body =
      mode === "generate"
        ? { mode: "generate", email: selectedLocation?.email, locationName: selectedLocation?.locationName, topic, imageUrl }
        : { mode: "manual", email: selectedLocation?.email, locationName: selectedLocation?.locationName, summaryText, imageUrl, ctaUrl };

    try {
      const res = await fetch("/api/gbp/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        <h1 className="text-2xl font-bold text-[#1a2b4a]">GBP Post Creator</h1>
        <p className="text-sm text-slate-500 mt-1">
          Let Gemini write your post or publish your own text directly to Google Business Profile.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-6 w-fit">
        {["generate", "manual"].map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setResult(null); setError(""); }}
            className={`px-5 py-2 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-sky-500 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {m === "generate" ? "AI Generate" : "Manual"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Location picker */}
        <LocationPicker value={selectedLocation} onChange={setSelectedLocation} />

        {/* AI Generate mode */}
        {mode === "generate" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Post Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. New CeraVe moisturiser now in stock"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Gemini will write a GEO-optimised post linking brands to your physical location.
            </p>
          </div>
        )}

        {/* Manual mode */}
        {mode === "manual" && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Post Text</label>
              <textarea
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                placeholder="Write your post content here…"
                required
                rows={4}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                CTA URL <span className="text-slate-400">(optional)</span>
              </label>
              <input
                type="url"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </>
        )}

        {/* Image URL (both modes) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Image URL <span className="text-slate-400">(optional)</span>
          </label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/product-image.jpg"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading
            ? mode === "generate" ? "Generating post…" : "Publishing…"
            : mode === "generate" ? "Generate & Publish Post" : "Publish Post"}
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
          <p className="text-sm font-semibold text-green-800">Post published successfully!</p>
          {result.postText && (
            <div className="bg-white border border-green-100 rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">AI-Generated Text</p>
              <p className="text-sm text-slate-700 leading-relaxed">{result.postText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
