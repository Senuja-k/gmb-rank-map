'use client';

/**
 * GeminiLiveChat — Floating dashboard assistant powered by Gemini 3.1 Flash-Lite.
 * Refactored to use standard text models and persistent usage tracking.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  partial?: boolean;
  thought?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get user's email from localStorage. */
function getUserEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const apiKeysStr = localStorage.getItem('apiKeys');
    const activeIdx = parseInt(localStorage.getItem('activeApiKeyIndex') ?? '0', 10);
    if (!apiKeysStr) return null;
    const apiKeys = JSON.parse(apiKeysStr);
    return apiKeys[activeIdx]?.email ?? null;
  } catch {
    return null;
  }
}

/** Fetch all saved GBP locations. */
async function fetchGBPLocations(): Promise<unknown> {
  try {
    const res = await fetch('/api/gbp/connect/saved');
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    return json.locations || json;
  } catch (err) {
    return { error: `Failed to fetch locations: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Fetch reviews from all enabled GBP locations. */
async function fetchGBPReviews(days?: number): Promise<unknown> {
  try {
    const query = days !== undefined ? `?days=${days}` : '';
    const res = await fetch(`/api/gbp/reviews${query}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: `Failed to fetch reviews: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Fetch published posts from all enabled GBP locations. */
async function fetchGBPPosts(days?: number): Promise<unknown> {
  try {
    const query = days !== undefined ? `?days=${days}` : '';
    const res = await fetch(`/api/gbp/posts${query}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: `Failed to fetch posts: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Fetch performance metrics for a specific location. */
async function fetchLocationPerformance(email: string, locationName: string, days = 7): Promise<unknown> {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    const params = new URLSearchParams({
      email,
      locationName,
      startYear: String(startDate.getFullYear()),
      startMonth: String(startDate.getMonth() + 1),
      startDay: String(startDate.getDate()),
      endYear: String(endDate.getFullYear()),
      endMonth: String(endDate.getMonth() + 1),
      endDay: String(endDate.getDate()),
    });
    
    const res = await fetch(`/api/gbp/performance?${params}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    return json.data || json;
  } catch (err) {
    return { error: `Failed to fetch performance: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Gemini 1.5 Flash is the current high-throughput model with a free tier limit of 1,500 RPD.
const CHAT_MODEL = 'gemini-1.5-flash';
const MODEL_USAGE_KEY = "gbp_model_usage";
const MAX_RPD = 1500;

function getUsageToday(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = JSON.parse(localStorage.getItem(MODEL_USAGE_KEY) ?? "{}");
    const today = new Date().toISOString().slice(0, 10);
    const entry = raw[CHAT_MODEL];
    return entry?.date === today ? entry.used : 0;
  } catch { return 0; }
}

function trackRequest() {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.parse(localStorage.getItem(MODEL_USAGE_KEY) ?? "{}");
    const today = new Date().toISOString().slice(0, 10);
    const entry = raw[CHAT_MODEL];
    raw[CHAT_MODEL] = { date: today, used: (entry?.date === today ? entry.used : 0) + 1 };
    localStorage.setItem(MODEL_USAGE_KEY, JSON.stringify(raw));
  } catch {}
}

// ─── Tool Definitions for Function Calling ───────────────────────────────────

const TOOLS = [
  {
    googleSearchRetrieval: {},
  },
  {
    function_declarations: [
      {
        name: 'getGBPLocations',
        description: 'Read all saved Google Business Profile locations in the app, including display names, resource names, enabled state, addresses, and Google emails',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'getLocationPerformance',
        description: 'Read performance metrics such as views, searches, direction requests, and call clicks for a specific GBP location',
        parameters: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'The Google email address for the location. If omitted, use the current user email or ask/list locations first.',
            },
            locationName: {
              type: 'string',
              description: 'The location resource name (e.g., accounts/123/locations/456)',
            },
            days: {
              type: 'integer',
              description: 'Number of days of recent data to fetch (default: 7)',
            },
          },
          required: ['locationName'],
        },
      },
      {
        name: 'getGBPReviews',
        description: 'Read all available customer reviews from all saved and enabled GBP locations in the app. This does not generate or post replies.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'getGBPPosts',
        description: 'Read all available published Google Business Profile posts from all saved and enabled GBP locations in the app. This is read-only and never publishes posts.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ],
  },
];

function getSystemInstruction(userEmail: string | null): string {
  return userEmail
    ? `You are an AI assistant for GBP Manager. 
       You have READ-ONLY access to user's GBP data (locations, performance, reviews, posts, historical data) via tools.
       You also have Google Search access to analyze performance trends or answer business questions. 
       STRICTLY READ-ONLY: Never claim you can publish, reply, or modify data.
       Current user: ${userEmail}`
    : `You are a GBP Manager assistant. 
       You have READ-ONLY access to saved data and Google Search. 
       STRICTLY READ-ONLY: Never claim you can modify data.`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GeminiLiveChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [dailyUsage, setDailyUsage] = useState(0);
  const [isThinking, setIsThinking] = useState(false);

  const chatSessionRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDailyUsage(getUsageToday());
    const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!key || key.trim() === '' || key === 'undefined') {
      setConnectError('Missing or invalid NEXT_PUBLIC_GEMINI_API_KEY. Check your .env.local and restart the server.');
      return;
    }
    const genAI = new GoogleGenerativeAI(key.trim());
    const userEmail = getUserEmail();
    const model = genAI.getGenerativeModel({
      model: CHAT_MODEL,
      systemInstruction: getSystemInstruction(userEmail),
      tools: TOOLS,
    });
    chatSessionRef.current = model.startChat({ history: [] });
  }, []);

  useEffect(() => {
    return () => {
      chatSessionRef.current = null;
    };
  }, []);

  const sendText = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !chatSessionRef.current) return;

    setInputText('');
    const userMsg: ChatMessage = { id: `${Date.now()}-user`, role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    try {
      let result = await chatSessionRef.current.sendMessage(text);
      trackRequest();
      setDailyUsage(getUsageToday());

      // Handle potential tool calls iteratively
      let response = await result.response;
      let calls = response.functionCalls();

      while (calls && calls.length > 0) {
        const functionResponses = await Promise.all(
          calls.map(async (call: any) => {
            const userEmail = getUserEmail();
            let output: any;
            try {
              if (call.name === 'getGBPLocations') output = await fetchGBPLocations();
              else if (call.name === 'getLocationPerformance') {
                output = await fetchLocationPerformance(call.args.email || userEmail, call.args.locationName, call.args.days);
              } else if (call.name === 'getGBPReviews') output = await fetchGBPReviews(call.args.days);
              else if (call.name === 'getGBPPosts') output = await fetchGBPPosts(call.args.days);
              else output = { error: `Unknown tool: ${call.name}` };
            } catch (e) {
              output = { error: String(e) };
            }
            return { functionResponse: { name: call.name, response: output } };
          })
        );

        result = await chatSessionRef.current.sendMessage(functionResponses);
        response = await result.response;
        calls = response.functionCalls();
      }

      const assistantText = response.text();
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-ai`, role: 'assistant', text: assistantText },
      ]);
    } catch (err) {
      console.error('[GeminiChat] Error:', err);
      setConnectError(`Chat error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsThinking(false);
    }
  }, [inputText]);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Derived display values ────────────────────────────────────────────────

  const statusDot = chatSessionRef.current ? 'bg-emerald-400' : 'bg-slate-400';

  const panelBorder = 'border-slate-200';

  const fabClass = [
    'w-14 h-14 rounded-full shadow-xl flex items-center justify-center',
    'transition-all duration-200 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    isOpen
      ? 'bg-[#1a2b4a] hover:bg-slate-700 shadow-slate-400/30 focus-visible:ring-slate-500'
      : 'bg-[#0ea5e9] hover:bg-sky-500 shadow-sky-400/40 focus-visible:ring-sky-400',
  ].join(' ');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Fixed launcher + panel ─────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

        {/* ── Chat panel ──────────────────────────────────────────────── */}
        {isOpen && (
          <div
            className={`w-[380px] flex flex-col rounded-2xl shadow-2xl overflow-hidden border-2 transition-all duration-200 bg-white ${panelBorder}`}
            style={{ height: 500 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#1a2b4a] text-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                <span className="text-sm font-semibold tracking-tight truncate">
                  GBP Assistant
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                {/* Close */}
                <button
                  onClick={() => setIsOpen(false)}
                  title="Close"
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors focus:outline-none"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50 scroll-smooth">
              
              {/* ── Empty state (connection not ready) ── */}
              {messages.length === 0 && !chatSessionRef.current && (
                <div className="flex flex-col items-center justify-center h-full text-center select-none gap-3">
                  {/* Three-dot pulse spinner */}
                  <div className="flex items-center gap-1.5">
                    {[0, 160, 320].map((delay) => (
                      <span
                        key={delay}
                        className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 font-medium">Initializing AI…</p>
                </div>
              )}

              {/* ── Normal empty state ── */}
              {messages.length === 0 && chatSessionRef.current && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-8 select-none">
                  <div className="text-3xl mb-3">🤖</div>
                  <p className="text-sm font-medium text-slate-500">GBP Dashboard Assistant</p>
                  <p className="text-xs mt-1 max-w-[220px] leading-relaxed text-slate-400">
                    Ask about rankings, reviews, posts, or business performance metrics.
                  </p>
                </div>
              )}

              {/* ── Disconnected empty state ── */}
              {messages.length === 0 && connectError && (
                <div className="flex flex-col items-center justify-center h-full text-center select-none gap-2 px-4">
                  <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p className="text-xs text-slate-500 font-medium">Not connected</p>
                  <p className="text-[11px] text-red-400 bg-red-50 border border-red-100 rounded-lg px-3 py-2 max-w-full break-words leading-relaxed">
                    {connectError}
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Assistant avatar */}
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-[#1a2b4a] text-white text-[9px] font-bold flex items-center justify-center shrink-0 mr-2 mt-0.5 select-none">
                      AI
                    </div>
                  )}

                  <div className="flex flex-col gap-1 max-w-[76%]">
                    {msg.thought && (
                      <div className="text-[11px] text-slate-400 italic bg-slate-100/50 px-2 py-1 rounded-lg border border-slate-100 mb-1">
                        {msg.thought}
                      </div>
                    )}
                    
                  <div
                    className={[
                      'max-w-[76%] text-sm px-3 py-2 rounded-2xl leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-[#0ea5e9] text-white rounded-br-sm'
                        : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm shadow-sm',
                      msg.partial ? 'opacity-75' : '',
                    ].join(' ')}
                  >
                    {msg.text}
                  </div>
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="flex justify-start">
                  <div className="w-6 h-6 rounded-full bg-[#1a2b4a] text-white text-[9px] font-bold flex items-center justify-center shrink-0 mr-2 mt-0.5 select-none">
                    AI
                  </div>
                  <div className="flex flex-col gap-1 max-w-[76%]">
                    <div className="bg-white text-slate-700 border border-slate-200 rounded-2xl rounded-bl-sm shadow-sm text-sm px-3 py-2 italic flex items-center gap-2">
                      Thinking
                      <span className="inline-flex items-center gap-0.5">
                        {[0, 150, 300].map((delay) => (
                          <span
                            key={delay}
                            className="w-1 h-1 rounded-full bg-slate-400 animate-bounce"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div
              className="shrink-0 flex items-center gap-2 px-3 py-3 border-t bg-white border-slate-100"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendText();
                  }
                }}
                placeholder="Type a message…"
                className="flex-1 text-sm bg-slate-100 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-400/60 text-slate-700 placeholder-slate-400 transition-shadow"
              />

              {/* Send button */}
              <button
                onClick={sendText}
                disabled={!inputText.trim() || !chatSessionRef.current || isThinking}
                title="Send (Enter)"
                className="shrink-0 p-2 rounded-xl bg-[#0ea5e9] text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>

            {/* Usage/Quota Footer */}
            {(chatSessionRef.current || messages.length > 0) && (
              <div className="shrink-0 px-4 py-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 bg-white">
                <div className="flex gap-3">
                  <span>Daily Usage: <b className="text-slate-600">{dailyUsage} / {MAX_RPD}</b></span>
                </div>
                <span className="italic">{CHAT_MODEL}</span>
              </div>

            )}
          </div>
        )}

        {/* ── Floating action button ───────────────────────────────────── */}
        <button
          onClick={() => setIsOpen((v) => !v)}
          aria-label={isOpen ? 'Close GBP Assistant' : 'Open GBP Assistant'}
          className={fabClass}
        >
          {isOpen ? (
            /* X icon */
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            /* Sparkle / bot icon */
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          )}
        </button>
      </div>
    </>
  );
}
