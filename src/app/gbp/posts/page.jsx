"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

const POST_TYPES = [
  { key: "UPDATE", label: "Update" },
  { key: "OFFER", label: "Offer" },
  { key: "EVENT", label: "Event" },
];

function UploadIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function ImageUploadZone({ locationName, imageData, onChange }) {
  const inputRef = useRef();

  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const previewUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(",")[1];
      onChange({ file, previewUrl, base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  if (imageData?.previewUrl) {
    return (
      <div className="relative group w-full h-36 rounded-xl overflow-hidden border border-slate-200">
        <img src={imageData.previewUrl} alt="" className="w-full h-full object-cover" />
        <button
          onClick={() => onChange(null)}
          className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-200 hover:border-sky-400 rounded-xl cursor-pointer transition-colors bg-slate-50 hover:bg-sky-50"
    >
      <div className="text-slate-400 mb-1"><UploadIcon /></div>
      <p className="text-xs text-slate-500 font-medium">Click or drag image here</p>
      <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WEBP up to 10 MB</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

export default function PostsPage() {
  const [locations, setLocations] = useState([]);
  const [locLoading, setLocLoading] = useState(true);
  const [selectedLocs, setSelectedLocs] = useState(new Set());

  const [postType, setPostType] = useState("UPDATE");
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [offerTerms, setOfferTerms] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  const [sameContent, setSameContent] = useState(true);
  const [globalTitle, setGlobalTitle] = useState("");
  const [globalContent, setGlobalContent] = useState("");

  // perLoc[locationName] = { imageData, title, content, generating }
  const [perLoc, setPerLoc] = useState({});

  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState(null);

  useEffect(() => {
    (async () => {
      setLocLoading(true);
      try {
        const res = await fetch("/api/gbp/connect/saved");
        const data = await res.json();
        const enabled = (data.locations ?? []).filter((l) => l.is_enabled);
        setLocations(enabled);
        setSelectedLocs(new Set(enabled.map((l) => l.location_name)));
        const initial = {};
        for (const l of enabled) {
          initial[l.location_name] = { imageData: null, title: "", content: "", generating: false };
        }
        setPerLoc(initial);
      } finally {
        setLocLoading(false);
      }
    })();
  }, []);

  function toggleLocation(locationName) {
    setSelectedLocs((prev) => {
      const next = new Set(prev);
      if (next.has(locationName)) next.delete(locationName);
      else next.add(locationName);
      return next;
    });
  }

  function setLocImage(locationName, imageData) {
    setPerLoc((prev) => ({
      ...prev,
      [locationName]: { ...prev[locationName], imageData },
    }));
  }

  function setLocContent(locationName, field, value) {
    setPerLoc((prev) => ({
      ...prev,
      [locationName]: { ...prev[locationName], [field]: value },
    }));
  }

  async function generateForLocation(locationName) {
    const locData = perLoc[locationName];
    if (!locData?.imageData?.base64) return;

    setPerLoc((prev) => ({
      ...prev,
      [locationName]: { ...prev[locationName], generating: true },
    }));

    try {
      const res = await fetch("/api/gbp/posts/generate-from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: locData.imageData.base64,
          mimeType: locData.imageData.mimeType,
          postType,
        }),
      });
      const data = await res.json();

      if (sameContent) {
        setGlobalTitle(data.title ?? "");
        setGlobalContent(data.content ?? "");
      } else {
        setPerLoc((prev) => ({
          ...prev,
          [locationName]: {
            ...prev[locationName],
            title: data.title ?? "",
            content: data.content ?? "",
          },
        }));
      }
    } catch (err) {
      console.error("generate-from-image error:", err);
    }

    setPerLoc((prev) => ({
      ...prev,
      [locationName]: { ...prev[locationName], generating: false },
    }));
  }

  async function uploadImage(locationName) {
    const imageData = perLoc[locationName]?.imageData;
    if (!imageData?.file) return "";

    const ext = imageData.file.name.split(".").pop() || "jpg";
    const safeLoc = locationName.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
    const path = `${Date.now()}-${safeLoc}.${ext}`;

    const { data, error } = await supabase.storage
      .from("post-images")
      .upload(path, imageData.file, { contentType: imageData.mimeType, upsert: true });

    if (error) throw new Error(`Image upload failed: ${error.message}`);

    const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(data.path);
    return urlData.publicUrl;
  }

  function parseDateToApi(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split("-");
    return { year: parseInt(y), month: parseInt(m), day: parseInt(d) };
  }

  async function handlePublish() {
    const locsToPublish = locations.filter((l) => selectedLocs.has(l.location_name));
    if (!locsToPublish.length) return;

    setPublishing(true);
    setPublishResults(null);

    const results = {};

    for (const loc of locsToPublish) {
      try {
        const imageUrl = await uploadImage(loc.location_name);

        const title = sameContent ? globalTitle : (perLoc[loc.location_name]?.title ?? "");
        const content = sameContent ? globalContent : (perLoc[loc.location_name]?.content ?? "");

        let summary;
        if (postType === "EVENT") {
          summary = content;
        } else {
          summary = title ? `${title}\n\n${content}` : content;
        }

        if (!summary.trim()) throw new Error("Post content is empty. Please add a description or generate from image.");

        const apiTopicType = postType === "UPDATE" ? "STANDARD" : postType;

        const body = {
          email: loc.google_email,
          locationName: loc.location_name,
          summaryText: summary,
          imageUrl,
          ctaUrl,
          topicType: apiTopicType,
          ...(postType === "EVENT" && {
            eventData: {
              title: eventTitle || title,
              startDate: parseDateToApi(eventStart),
              endDate: parseDateToApi(eventEnd),
            },
          }),
          ...(postType === "OFFER" && {
            offerData: { couponCode, terms: offerTerms },
          }),
        };

        const res = await fetch("/api/gbp/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const respData = await res.json();
        if (!res.ok) throw new Error(respData.error ?? "Publish failed");

        results[loc.location_name] = { success: true };
      } catch (err) {
        results[loc.location_name] = { success: false, error: err.message };
      }
    }

    setPublishResults(results);
    setPublishing(false);
  }

  const selectedCount = selectedLocs.size;
  const anyGenerating = Object.values(perLoc).some((d) => d.generating);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-7">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1a2b4a]">GBP Post Creator</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload images, let Gemini write the content, and publish to one or more locations.
        </p>
      </div>

      {/* Post type */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Post Type</h2>
        <div className="flex gap-2">
          {POST_TYPES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPostType(key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                postType === key
                  ? "bg-sky-500 text-white border-sky-500"
                  : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Event extra fields */}
        {postType === "EVENT" && (
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Event Title</label>
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="e.g. Summer Skincare Sale"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={eventStart}
                  onChange={(e) => setEventStart(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={eventEnd}
                  onChange={(e) => setEventEnd(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Offer extra fields */}
        {postType === "OFFER" && (
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Coupon Code <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="e.g. SUMMER20"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Terms &amp; Conditions <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={offerTerms}
                onChange={(e) => setOfferTerms(e.target.value)}
                placeholder="e.g. Valid until June 30. In-store only."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>
        )}

        {/* CTA URL */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            CTA URL <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            type="url"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://yourwebsite.com"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Content mode toggle */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">Same content for all locations</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {sameContent
              ? "One shared title + description published to all selected locations."
              : "Each location gets its own title and description."}
          </p>
        </div>
        <button
          onClick={() => setSameContent((v) => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            sameContent ? "bg-sky-500" : "bg-slate-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              sameContent ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Global content (when sameContent = true) */}
      {sameContent && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Shared Post Content</h2>
          <p className="text-xs text-slate-400">
            Generate content from any location&apos;s image below, or type it manually.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
            <input
              type="text"
              value={globalTitle}
              onChange={(e) => setGlobalTitle(e.target.value)}
              placeholder="Post title…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea
              value={globalContent}
              onChange={(e) => setGlobalContent(e.target.value)}
              placeholder="Post body text… (max 300 characters recommended)"
              rows={4}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            />
            <p className="text-[10px] text-slate-400 mt-0.5 text-right">{globalContent.length} chars</p>
          </div>
        </div>
      )}

      {/* Locations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Locations</h2>
          {!locLoading && (
            <span className="text-xs text-slate-400">{selectedCount} of {locations.length} selected</span>
          )}
        </div>

        {locLoading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading locations…</div>
        ) : locations.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-8 text-center">
            <p className="text-sm text-slate-500">No enabled locations found.</p>
            <a href="/gbp/connect" className="text-xs text-sky-500 underline mt-1 inline-block">Connect a location →</a>
          </div>
        ) : (
          locations.map((loc) => {
            const isSelected = selectedLocs.has(loc.location_name);
            const locData = perLoc[loc.location_name] ?? {};
            const hasImage = !!locData.imageData?.base64;

            return (
              <div
                key={loc.location_name}
                className={`bg-white border rounded-2xl p-5 transition-all ${
                  isSelected ? "border-slate-200" : "border-slate-100 opacity-60"
                }`}
              >
                {/* Location header */}
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => toggleLocation(loc.location_name)}
                    className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                      isSelected ? "bg-sky-500 border-sky-500" : "border-slate-300 bg-white"
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{loc.display_name}</p>
                    {loc.address && <p className="text-[11px] text-slate-400">{loc.address}</p>}
                  </div>
                </div>

                {isSelected && (
                  <div className="space-y-3">
                    {/* Image upload */}
                    <ImageUploadZone
                      locationName={loc.location_name}
                      imageData={locData.imageData}
                      onChange={(data) => setLocImage(loc.location_name, data)}
                    />

                    {/* Generate button */}
                    <button
                      onClick={() => generateForLocation(loc.location_name)}
                      disabled={!hasImage || locData.generating || anyGenerating}
                      className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 border border-sky-200 bg-sky-50 hover:bg-sky-100 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors w-full justify-center"
                    >
                      <SparkleIcon />
                      {locData.generating
                        ? "Generating…"
                        : sameContent
                        ? "Generate shared content from this image"
                        : "Generate content from image"}
                    </button>

                    {/* Per-location content (when sameContent = false) */}
                    {!sameContent && (
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                          <input
                            type="text"
                            value={locData.title ?? ""}
                            onChange={(e) => setLocContent(loc.location_name, "title", e.target.value)}
                            placeholder="Post title…"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                          <textarea
                            value={locData.content ?? ""}
                            onChange={(e) => setLocContent(loc.location_name, "content", e.target.value)}
                            placeholder="Post body text…"
                            rows={3}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                          />
                          <p className="text-[10px] text-slate-400 mt-0.5 text-right">{(locData.content ?? "").length} chars</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Publish */}
      {!locLoading && locations.length > 0 && (
        <button
          onClick={handlePublish}
          disabled={publishing || selectedCount === 0}
          className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          {publishing ? "Publishing…" : `Publish to ${selectedCount} location${selectedCount !== 1 ? "s" : ""}`}
        </button>
      )}

      {/* Results */}
      {publishResults && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Publish Results</h2>
          {locations.filter((l) => publishResults[l.location_name]).map((loc) => {
            const res = publishResults[loc.location_name];
            return (
              <div key={loc.location_name} className="flex items-start gap-2">
                {res.success ? (
                  <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                ) : (
                  <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-red-100 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                )}
                <div>
                  <p className="text-xs font-medium text-slate-700">{loc.display_name}</p>
                  {!res.success && <p className="text-xs text-red-600 mt-0.5">{res.error}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
