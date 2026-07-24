"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

// ── Gemini model picker (shared constants + localStorage helpers) ─────────────
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
const GBP_POST_SUMMARY_MAX_CHARS = 1500;

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
// ─────────────────────────────────────────────────────────────────────────────

const POST_TYPES = [
  { key: "UPDATE", label: "Update" },
  { key: "OFFER", label: "Offer" },
  { key: "EVENT", label: "Event" },
];

const CTA_BUTTONS = [
  { key: "NONE", label: "None" },
  { key: "BOOK", label: "Book" },
  { key: "ORDER", label: "Order online" },
  { key: "SHOP", label: "Shop" },
  { key: "LEARN_MORE", label: "Learn more" },
  { key: "SIGN_UP", label: "Sign up" },
  { key: "CALL", label: "Call now" },
];

function isValidPublicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function buildPostSummary(postType, title, content) {
  if (postType === "EVENT" || postType === "OFFER") {
    return content ?? "";
  }
  return title ? `${title}\n\n${content ?? ""}` : (content ?? "");
}

function buildScheduledTimeIso(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const scheduledDate = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(scheduledDate.getTime())) return null;
  return scheduledDate.toISOString();
}

function formatScheduledTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return "";
  const scheduledDate = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(scheduledDate.getTime())) return "";
  return scheduledDate.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

// Generates options like "00:00", "00:30", ..., "23:30"
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

function TimeSelect({ value, onChange, placeholder = "Time (optional)" }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white text-slate-700"
    >
      <option value="">{placeholder}</option>
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
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
  const [ctaActionType, setCtaActionType] = useState("LEARN_MORE");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");

  // CTA settings
  const [ctaMode, setCtaMode] = useState("common"); // 'common' | 'individual'
  const [commonCtaUrl, setCommonCtaUrl] = useState("");
  const [showCtaSettings, setShowCtaSettings] = useState(false);
  const [ctaDraftCommon, setCtaDraftCommon] = useState("");
  const [ctaDraftLocs, setCtaDraftLocs] = useState({}); // locationName → cta_url
  const [savingCta, setSavingCta] = useState(false);

  // Post prompt settings
  const [postPrompt, setPostPrompt] = useState("");
  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  const [sameContent, setSameContent] = useState(true);
  const [globalTitle, setGlobalTitle] = useState("");
  const [globalContent, setGlobalContent] = useState("");

  // perLoc[locationName] = { imageData, title, content, generating }
  const [perLoc, setPerLoc] = useState({});

  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState(null);
  const [publishMode, setPublishMode] = useState("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  const [geminiModel, setGeminiModel] = useState(DEFAULT_MODEL);
  const [modelUsage, setModelUsage] = useState({});

  useEffect(() => {
    const savedModel = localStorage.getItem(AI_MODEL_KEY);
    if (savedModel && GEMINI_MODELS.some((m) => m.id === savedModel)) setGeminiModel(savedModel);
    setModelUsage(readUsageToday());
  }, []);

  useEffect(() => {
    (async () => {
      setLocLoading(true);
      try {
        const [savedRes, ctaRes, promptRes] = await Promise.all([
          fetch("/api/gbp/connect/saved"),
          fetch("/api/gbp/connect/cta"),
          fetch("/api/gbp/posts/prompt"),
        ]);
        const savedData = await savedRes.json();
        const ctaData = await ctaRes.json();
        const promptData = await promptRes.json();
        setPostPrompt(promptData.prompt ?? "");

        const enabled = (savedData.locations ?? []).filter((l) => l.is_enabled);
        setLocations(enabled);
        setSelectedLocs(new Set(enabled.map((l) => l.location_name)));
        const initial = {};
        for (const l of enabled) {
          initial[l.location_name] = { imageData: null, title: "", content: "", generating: false };
        }
        setPerLoc(initial);

        setCommonCtaUrl(ctaData.commonCtaUrl ?? "");
        // Merge CTA data from both sources (saved has cta_url per loc too)
        const locCtaMap = {};
        for (const l of enabled) locCtaMap[l.location_name] = l.cta_url ?? "";
        // Overwrite with fresher cta endpoint data if available
        for (const l of ctaData.locations ?? []) locCtaMap[l.location_name] = l.cta_url ?? "";
        setCtaDraftLocs(locCtaMap);
      } finally {
        setLocLoading(false);
      }
    })();
  }, []);

  async function saveCtaSettings() {
    setSavingCta(true);
    try {
      await fetch("/api/gbp/connect/cta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commonCtaUrl: ctaDraftCommon,
          locationCtas: Object.entries(ctaDraftLocs).map(([locationName, ctaUrl]) => ({ locationName, ctaUrl })),
        }),
      });
      setCommonCtaUrl(ctaDraftCommon);
      // Update cta_url on locations array so handlePublish picks up changes
      setLocations((prev) => prev.map((l) => ({ ...l, cta_url: ctaDraftLocs[l.location_name] ?? l.cta_url })));
      setShowCtaSettings(false);
    } finally {
      setSavingCta(false);
    }
  }

  function openCtaSettings() {
    setCtaDraftCommon(commonCtaUrl);
    setShowCtaSettings(true);
  }

  async function savePromptSettings() {
    setSavingPrompt(true);
    try {
      await fetch("/api/gbp/posts/prompt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptDraft }),
      });
      setPostPrompt(promptDraft);
      setShowPromptSettings(false);
    } finally {
      setSavingPrompt(false);
    }
  }

  function openPromptSettings() {
    setPromptDraft(postPrompt);
    setShowPromptSettings(true);
  }

  function selectModel(id) { setGeminiModel(id); localStorage.setItem(AI_MODEL_KEY, id); }

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
          customPrompt: postPrompt,
          geminiModel,
        }),
      });
      const data = await res.json();

      if (res.ok) { const c = persistIncrement(geminiModel); setModelUsage((p) => ({ ...p, [geminiModel]: c })); }

      // For EVENT/OFFER the title goes into eventTitle (the dedicated Title field)
      if ((postType === "EVENT" || postType === "OFFER") && data.title) {
        setEventTitle(data.title);
      }

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

  function parseTimeToApi(timeStr) {
    if (!timeStr) return null;
    const [h, mn] = timeStr.split(":");
    return { hours: parseInt(h), minutes: parseInt(mn), seconds: 0, nanos: 0 };
  }

  async function handlePublish() {
    const locsToPublish = locations.filter((l) => selectedLocs.has(l.location_name));
    if (!locsToPublish.length) return;

    const scheduledTimeIso = publishMode === "schedule" ? buildScheduledTimeIso(scheduledDate, scheduledTime) : null;
    if (publishMode === "schedule") {
      if (!scheduledTimeIso) {
        setPublishResults({
          _scheduler: { success: false, error: "Choose a valid schedule date and time." },
        });
        return;
      }
      if (new Date(scheduledTimeIso).getTime() <= Date.now()) {
        setPublishResults({
          _scheduler: { success: false, error: "Scheduled time must be in the future." },
        });
        return;
      }
    }

    setPublishing(true);
    setPublishResults(null);

    const results = {};

    for (const loc of locsToPublish) {
      try {
        const imageUrl = await uploadImage(loc.location_name);

        const title = sameContent ? globalTitle : (perLoc[loc.location_name]?.title ?? "");
        const content = sameContent ? globalContent : (perLoc[loc.location_name]?.content ?? "");
        const summary = buildPostSummary(postType, title, content);

        if (!summary.trim()) throw new Error("Post content is empty. Please add a description or generate from image.");
        if (summary.trim().length > GBP_POST_SUMMARY_MAX_CHARS) {
          throw new Error(
            `Post description is ${summary.trim().length.toLocaleString()} characters. Google Business Profile accepts ${GBP_POST_SUMMARY_MAX_CHARS.toLocaleString()} characters or fewer.`
          );
        }

        const apiTopicType = postType === "UPDATE" ? "STANDARD" : postType;

        const resolvedCta = ctaMode === "common" ? commonCtaUrl : (loc.cta_url ?? "");

        const needsCtaUrl = postType !== "OFFER" && ctaActionType !== "NONE" && ctaActionType !== "CALL";
        if (needsCtaUrl && !isValidPublicUrl(resolvedCta)) {
          throw new Error(`A valid Button URL is required for ${ctaActionType}.`);
        }

        const body = {
          email: loc.google_email,
          locationName: loc.location_name,
          summaryText: summary,
          imageUrl,
          ctaUrl: needsCtaUrl ? resolvedCta : "",
          ctaActionType: postType !== "OFFER" ? ctaActionType : "NONE",
          topicType: apiTopicType,
          scheduledTime: scheduledTimeIso,
          ...((postType === "EVENT" || postType === "OFFER") && {
            eventData: {
              title: eventTitle,
              startDate: parseDateToApi(eventStart),
              endDate: parseDateToApi(eventEnd),
              ...((postType === "EVENT" || postType === "OFFER") && {
                startTime: parseTimeToApi(eventStartTime),
                endTime: parseTimeToApi(eventEndTime),
              }),
            },
          }),
          ...(postType === "OFFER" && {
            offerData: { couponCode, redeemUrl: resolvedCta, terms: offerTerms },
          }),
        };

        const res = await fetch("/api/gbp/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const respData = await res.json();
        if (!res.ok) throw new Error(respData.error ?? "Publish failed");

        results[loc.location_name] = {
          success: true,
          scheduled: publishMode === "schedule",
          scheduledLabel: publishMode === "schedule" ? formatScheduledTime(scheduledDate, scheduledTime) : "",
        };
      } catch (err) {
        results[loc.location_name] = { success: false, error: err.message };
      }
    }

    setPublishResults(results);
    setPublishing(false);
  }

  const selectedCount = selectedLocs.size;
  const anyGenerating = Object.values(perLoc).some((d) => d.generating);
  const globalSummaryLength = buildPostSummary(postType, globalTitle, globalContent).trim().length;
  const globalSummaryTooLong = globalSummaryLength > GBP_POST_SUMMARY_MAX_CHARS;
  const publishActionLabel = publishMode === "schedule" ? "Schedule" : "Publish";
  const publishProgressLabel = publishMode === "schedule" ? "Scheduling" : "Publishing";
  const scheduledLabel = formatScheduledTime(scheduledDate, scheduledTime);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-7">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2b4a]">GBP Post Creator</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload images, let Gemini write the content, and publish to one or more locations.
          </p>
        </div>
        <button
          onClick={openPromptSettings}
          className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-slate-600 hover:text-sky-600 border border-slate-200 hover:border-sky-300 bg-white rounded-lg px-3 py-2 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.346A3.326 3.326 0 0013 18.35V19a2 2 0 11-4 0v-.65a3.326 3.326 0 00-.97-2.297l-.347-.346z" />
          </svg>
          AI Settings
          {(() => { const m = GEMINI_MODELS.find((x) => x.id === geminiModel); return m ? <span className={`ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.badgeColor}`}>{m.label}</span> : null; })()}
          {postPrompt && <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-sky-500 inline-block" />}
        </button>
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
              <label className="block text-xs font-medium text-slate-600 mb-1">Event Title*</label>
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="e.g. Summer Skincare Sale"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Start Date*</label>
                <input
                  type="date"
                  value={eventStart}
                  onChange={(e) => setEventStart(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Start Time</label>
                <TimeSelect value={eventStartTime} onChange={setEventStartTime} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">End Date*</label>
                <input
                  type="date"
                  value={eventEnd}
                  onChange={(e) => setEventEnd(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">End Time</label>
                <TimeSelect value={eventEndTime} onChange={setEventEndTime} />
              </div>
            </div>
          </div>
        )}

        {/* Offer extra fields */}
        {postType === "OFFER" && (
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Offer Title*</label>
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="e.g. Summer Skincare Sale"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Start Date*</label>
                <input
                  type="date"
                  value={eventStart}
                  onChange={(e) => setEventStart(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Start Time</label>
                <TimeSelect value={eventStartTime} onChange={setEventStartTime} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">End Date*</label>
                <input
                  type="date"
                  value={eventEnd}
                  onChange={(e) => setEventEnd(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">End Time</label>
                <TimeSelect value={eventEndTime} onChange={setEventEndTime} />
              </div>
            </div>
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
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-600">Redeem Online URL</label>
                <button
                  onClick={openCtaSettings}
                  className="flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-800 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manage CTAs
                </button>
              </div>
              <div className="flex gap-2">
                {[{ key: "common", label: "Common CTA" }, { key: "individual", label: "Individual CTAs" }].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setCtaMode(key)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      ctaMode === key
                        ? "bg-sky-500 text-white border-sky-500"
                        : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {ctaMode === "common"
                  ? commonCtaUrl
                    ? <><span className="text-slate-500 font-medium">All locations → </span>{commonCtaUrl}</>
                    : <span className="text-amber-500">No common CTA saved yet — click Manage CTAs</span>
                  : "Each location uses its own saved CTA URL"}
              </p>
            </div>
          </div>
        )}

        {/* CTA Button — UPDATE and EVENT only (OFFER uses redeemOnlineUrl) */}
        {postType !== "OFFER" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Button Type</label>
              <div className="flex flex-wrap gap-1.5">
                {CTA_BUTTONS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setCtaActionType(key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      ctaActionType === key
                        ? "bg-sky-500 text-white border-sky-500"
                        : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {ctaActionType === "CALL" && (
              <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                The &ldquo;Call now&rdquo; button uses your business phone number — no URL needed.
              </p>
            )}
            {ctaActionType !== "NONE" && ctaActionType !== "CALL" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-600">Button URL</label>
                  <button
                    onClick={openCtaSettings}
                    className="flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-800 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Manage CTAs
                  </button>
                </div>
                <div className="flex gap-2">
                  {[{ key: "common", label: "Common CTA" }, { key: "individual", label: "Individual CTAs" }].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setCtaMode(key)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                        ctaMode === key
                          ? "bg-sky-500 text-white border-sky-500"
                          : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {ctaMode === "common"
                    ? commonCtaUrl
                      ? <><span className="text-slate-500 font-medium">All locations → </span>{commonCtaUrl}</>
                      : <span className="text-amber-500">No common CTA saved yet — click Manage CTAs</span>
                    : "Each location uses its own saved CTA URL"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scheduler */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Publish Time</h2>
          <p className="text-xs text-slate-400 mt-0.5">Send the post immediately or schedule it on Google Business Profile.</p>
        </div>
        <div className="flex gap-2">
          {[
            { key: "now", label: "Publish now" },
            { key: "schedule", label: "Schedule" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPublishMode(key)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                publishMode === key
                  ? "bg-sky-500 text-white border-sky-500"
                  : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {publishMode === "schedule" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Schedule Date*</label>
              <input
                type="date"
                value={scheduledDate}
                min={todayStr()}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Schedule Time*</label>
              <TimeSelect value={scheduledTime} onChange={setScheduledTime} placeholder="Choose time" />
            </div>
            {scheduledLabel && (
              <p className="col-span-2 text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                Scheduled for {scheduledLabel}
              </p>
            )}
          </div>
        )}
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
          {postType === "UPDATE" && (
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
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea
              value={globalContent}
              onChange={(e) => setGlobalContent(e.target.value)}
              placeholder="Post body text…"
              rows={4}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            />
            <p className={`text-[10px] mt-0.5 text-right ${globalSummaryTooLong ? "text-red-500 font-medium" : "text-slate-400"}`}>
              {globalSummaryLength.toLocaleString()} / {GBP_POST_SUMMARY_MAX_CHARS.toLocaleString()} chars
            </p>
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
            const locSummaryLength = buildPostSummary(postType, locData.title ?? "", locData.content ?? "").trim().length;
            const locSummaryTooLong = locSummaryLength > GBP_POST_SUMMARY_MAX_CHARS;

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
                        {postType === "UPDATE" && (
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
                        )}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                          <textarea
                            value={locData.content ?? ""}
                            onChange={(e) => setLocContent(loc.location_name, "content", e.target.value)}
                            placeholder="Post body text…"
                            rows={3}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                          />
                          <p className={`text-[10px] mt-0.5 text-right ${locSummaryTooLong ? "text-red-500 font-medium" : "text-slate-400"}`}>
                            {locSummaryLength.toLocaleString()} / {GBP_POST_SUMMARY_MAX_CHARS.toLocaleString()} chars
                          </p>
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
          {publishing ? `${publishProgressLabel}…` : `${publishActionLabel} to ${selectedCount} location${selectedCount !== 1 ? "s" : ""}`}
        </button>
      )}

      {/* Results */}
      {publishResults && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">{publishMode === "schedule" ? "Schedule Results" : "Publish Results"}</h2>
          {publishResults._scheduler && (
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
              <p className="text-xs text-red-600">{publishResults._scheduler.error}</p>
            </div>
          )}
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
                  {res.success && res.scheduled && (
                    <p className="text-xs text-emerald-600 mt-0.5">Scheduled for {res.scheduledLabel}</p>
                  )}
                  {!res.success && <p className="text-xs text-red-600 mt-0.5">{res.error}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showCtaSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">CTA URL Settings</h2>
                <p className="text-xs text-slate-400 mt-0.5">Saved automatically — no need to re-enter on each post.</p>
              </div>
              <button onClick={() => setShowCtaSettings(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-5">
              {/* Common CTA */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Common CTA URL</label>
                <p className="text-[11px] text-slate-400 mb-2">Used for all locations when &ldquo;Common CTA&rdquo; mode is selected.</p>
                <input
                  type="url"
                  value={ctaDraftCommon}
                  onChange={(e) => setCtaDraftCommon(e.target.value)}
                  placeholder="https://cosmetics.lk"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Per-location CTAs */}
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">Individual CTA URLs</p>
                <p className="text-[11px] text-slate-400 mb-3">Used when &ldquo;Individual CTAs&rdquo; mode is selected.</p>
                <div className="space-y-3">
                  {locations.map((loc) => (
                    <div key={loc.location_name}>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">{loc.display_name}</label>
                      <input
                        type="url"
                        value={ctaDraftLocs[loc.location_name] ?? ""}
                        onChange={(e) =>
                          setCtaDraftLocs((prev) => ({ ...prev, [loc.location_name]: e.target.value }))
                        }
                        placeholder="https://cosmetics.lk/location-page"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowCtaSettings(false)} className="text-xs text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={saveCtaSettings} disabled={savingCta} className="text-xs font-semibold bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white px-5 py-2 rounded-lg transition-colors">
                {savingCta ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Settings modal */}
      {showPromptSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">AI Settings</h2>
                <p className="text-xs text-slate-400 mt-0.5">Choose a model and customise how Gemini writes post content.</p>
              </div>
              <button onClick={() => setShowPromptSettings(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
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

              {/* Prompt textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Prompt</label>
                <p className="text-[11px] text-slate-400 mb-3">
                  Leave blank to use the default prompt. When set, this replaces the default instruction sent to Gemini.
                  End your prompt with context like the type of business, tone, and any SEO goals.
                </p>
                <textarea
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  placeholder={`e.g. You are a social media manager for a luxury cosmetics showroom in Sri Lanka. Analyse this product image and write an engaging Google Business Profile post. Mention visible brands and link them to our physical showroom for local SEO. Keep the tone warm and aspirational.`}
                  rows={6}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 text-right">{promptDraft.length} chars</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => { setPromptDraft(""); }}
                className="text-xs text-slate-500 hover:text-red-500 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Reset to default
              </button>
              <div className="flex-1" />
              <button onClick={() => setShowPromptSettings(false)} className="text-xs text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={savePromptSettings} disabled={savingPrompt} className="text-xs font-semibold bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white px-5 py-2 rounded-lg transition-colors">
                {savingPrompt ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
