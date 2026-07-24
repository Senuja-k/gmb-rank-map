"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function getPostState(post) {
  return post.state ?? post.lifecycleState ?? post.status ?? "";
}

function getScheduledDate(post) {
  const value = post.scheduledTime ?? post.scheduleTime ?? "";
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isScheduledPost(post) {
  const state = getPostState(post).toUpperCase();
  const scheduledDate = getScheduledDate(post);
  return state === "SCHEDULED" || (scheduledDate && scheduledDate.getTime() > Date.now());
}

function formatDateTime(date) {
  if (!date) return "Not provided";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateInputValue(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(date) {
  if (!date) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildScheduledTimeIso(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const scheduledDate = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(scheduledDate.getTime())) return null;
  return scheduledDate.toISOString();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getPostTypeLabel(post) {
  const type = post.topicType ?? "STANDARD";
  if (type === "STANDARD") return "Update";
  if (type === "OFFER") return "Offer";
  if (type === "EVENT") return "Event";
  return type;
}

function getPostTitle(post) {
  return post.event?.title ?? post.offer?.couponCode ?? getPostTypeLabel(post);
}

export default function ScheduledPostsPage() {
  const [posts, setPosts] = useState([]);
  const [fetchErrors, setFetchErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingPost, setEditingPost] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deletingPostName, setDeletingPostName] = useState("");

  async function loadPosts() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/gbp/posts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load posts.");
      setPosts(data.posts ?? []);
      setFetchErrors(data.fetchErrors ?? []);
    } catch (err) {
      setError(err.message);
      setPosts([]);
      setFetchErrors([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPosts();
  }, []);

  const scheduledPosts = useMemo(
    () =>
      posts
        .filter(isScheduledPost)
        .map((post) => ({ ...post, scheduledDate: getScheduledDate(post) }))
        .sort((a, b) => {
          const aTime = a.scheduledDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const bTime = b.scheduledDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        }),
    [posts]
  );

  function openEdit(post) {
    const scheduledDate = getScheduledDate(post);
    setEditingPost(post);
    setEditTitle(post.event?.title ?? "");
    setEditSummary(post.summary ?? "");
    setEditDate(toDateInputValue(scheduledDate));
    setEditTime(toTimeInputValue(scheduledDate));
    setEditError("");
  }

  async function saveEdit() {
    if (!editingPost) return;
    const scheduledTime = buildScheduledTimeIso(editDate, editTime);
    if (!scheduledTime) {
      setEditError("Choose a valid schedule date and time.");
      return;
    }
    if (new Date(scheduledTime).getTime() <= Date.now()) {
      setEditError("Scheduled time must be in the future.");
      return;
    }

    setSavingEdit(true);
    setEditError("");
    try {
      const res = await fetch("/api/gbp/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editingPost.email,
          name: editingPost.name,
          summaryText: editSummary,
          scheduledTime,
          ...((editingPost.topicType === "EVENT" || editingPost.topicType === "OFFER") && {
            eventTitle: editTitle,
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update scheduled post.");
      setEditingPost(null);
      await loadPosts();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deletePost(post) {
    if (!window.confirm("Delete this scheduled post?")) return;
    setDeletingPostName(post.name);
    setError("");
    try {
      const res = await fetch("/api/gbp/posts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: post.email, name: post.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete scheduled post.");
      setPosts((prev) => prev.filter((item) => item.name !== post.name));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingPostName("");
    }
  }

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2b4a]">Scheduled Posts</h1>
          <p className="text-sm text-slate-400 mt-1">
            Upcoming Google Business Profile posts across enabled locations.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadPosts}
            disabled={loading}
            className="text-xs font-semibold text-slate-600 hover:text-sky-600 border border-slate-200 hover:border-sky-300 bg-white rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <Link
            href="/gbp/posts"
            className="text-xs font-semibold bg-sky-500 hover:bg-sky-600 text-white rounded-lg px-4 py-2 transition-colors"
          >
            Create Post
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl mb-6">
          <p className="text-sm font-semibold text-red-700">Error</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      )}

      {fetchErrors.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl mb-6">
          <p className="text-sm font-semibold text-amber-800">Some locations could not be checked</p>
          <div className="mt-2 space-y-1">
            {fetchErrors.map((item) => (
              <p key={item} className="text-xs text-amber-700">{item}</p>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">
            {scheduledPosts.length} scheduled post{scheduledPosts.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-slate-400">Sorted by scheduled time</p>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">Loading scheduled posts...</div>
        ) : scheduledPosts.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-slate-600">No scheduled posts found.</p>
            <p className="text-xs text-slate-400 mt-1">Schedule a post from the GBP Post Creator.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {scheduledPosts.map((post) => {
              const state = getPostState(post) || "SCHEDULED";
              const summary = (post.summary ?? "").trim();
              return (
                <article key={post.name ?? `${post.locationName}-${post.scheduledTime}-${summary}`} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-2 py-0.5">
                          {getPostTypeLabel(post)}
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                          {state}
                        </span>
                      </div>
                      <h2 className="text-sm font-semibold text-slate-800 truncate">{getPostTitle(post)}</h2>
                      <p className="text-xs text-slate-400 mt-0.5">{post.locationDisplayName ?? post.locationName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-slate-700">{formatDateTime(post.scheduledDate)}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Scheduled time</p>
                    </div>
                  </div>
                  {summary && (
                    <p className="text-sm text-slate-600 mt-3 line-clamp-3 whitespace-pre-line">{summary}</p>
                  )}
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => openEdit(post)}
                      className="text-xs font-semibold text-slate-600 hover:text-sky-600 border border-slate-200 hover:border-sky-300 bg-white rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deletePost(post)}
                      disabled={deletingPostName === post.name}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 border border-red-100 hover:border-red-200 bg-red-50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                    >
                      {deletingPostName === post.name ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">Edit Scheduled Post</h2>
                <p className="text-xs text-slate-400 mt-0.5">{editingPost.locationDisplayName ?? editingPost.locationName}</p>
              </div>
              <button onClick={() => setEditingPost(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {editError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {editError}
                </div>
              )}
              {(editingPost.topicType === "EVENT" || editingPost.topicType === "OFFER") && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Title*</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Summary*</label>
                <textarea
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  rows={7}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1 text-right">{editSummary.trim().length.toLocaleString()} chars</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Schedule Date*</label>
                  <input
                    type="date"
                    value={editDate}
                    min={todayStr()}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Schedule Time*</label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setEditingPost(null)}
                className="text-xs text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="text-xs font-semibold bg-sky-500 hover:bg-sky-600 disabled:bg-sky-200 text-white px-5 py-2 rounded-lg transition-colors"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
