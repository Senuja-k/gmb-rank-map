'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

type ChatStatus = 'idle' | 'ready' | 'thinking' | 'error';

const MODEL_USAGE_KEY = 'gbp_model_usage';
const CHAT_MODEL_ID = 'gemini-3.1-flash-lite';
const MAX_RPD = 500;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getUsageToday(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = JSON.parse(localStorage.getItem(MODEL_USAGE_KEY) ?? '{}');
    const today = todayStr();
    const entry = raw[CHAT_MODEL_ID];
    return entry?.date === today ? entry.used : 0;
  } catch {
    return 0;
  }
}

function trackRequest() {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.parse(localStorage.getItem(MODEL_USAGE_KEY) ?? '{}');
    const today = todayStr();
    const entry = raw[CHAT_MODEL_ID];
    raw[CHAT_MODEL_ID] = { date: today, used: (entry?.date === today ? entry.used : 0) + 1 };
    localStorage.setItem(MODEL_USAGE_KEY, JSON.stringify(raw));
  } catch {}
}

export default function GeminiLiveChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [dailyUsage, setDailyUsage] = useState(() => getUsageToday());
  const [status, setStatus] = useState<ChatStatus>('idle');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sendText = useCallback(async () => {
    const text = inputText.trim();
    if (!text || status === 'thinking') return;

    const userMessage: ChatMessage = { id: `${Date.now()}-user`, role: 'user', text };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInputText('');
    setConnectError(null);
    setStatus('thinking');

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((msg) => ({ role: msg.role, text: msg.text })),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Assistant request failed (${res.status})`);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          text: data.reply || 'No response returned.',
        },
      ]);
      trackRequest();
      setDailyUsage(getUsageToday());
      setStatus('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Assistant request failed.';
      setConnectError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant-error`,
          role: 'assistant',
          text: `I could not respond: ${message}`,
        },
      ]);
      setStatus('error');
    }
  }, [inputText, messages, status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const canSend = Boolean(inputText.trim()) && status !== 'thinking';
  const statusDot =
    status === 'thinking' ? 'bg-amber-400' : status === 'error' ? 'bg-rose-400' : isOpen ? 'bg-emerald-400' : 'bg-slate-400';
  const statusLabel = status === 'thinking' ? 'thinking' : status === 'error' ? 'error' : isOpen ? 'ready' : 'idle';
  const fabClass = [
    'w-14 h-14 rounded-full shadow-xl flex items-center justify-center',
    'transition-all duration-200 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    isOpen
      ? 'bg-[#1a2b4a] hover:bg-slate-700 shadow-slate-400/30 focus-visible:ring-slate-500'
      : 'bg-[#0ea5e9] hover:bg-sky-500 shadow-sky-400/40 focus-visible:ring-sky-400',
  ].join(' ');

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {isOpen && (
          <div
            className="w-[380px] flex flex-col rounded-2xl shadow-2xl overflow-hidden border-2 transition-all duration-200 bg-white border-slate-200"
            style={{ height: 500 }}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-[#1a2b4a] text-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                <span className="text-sm font-semibold tracking-tight truncate">GBP Assistant</span>
              </div>

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

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50 scroll-smooth">
              {messages.length === 0 && !connectError && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-8 select-none">
                  <div className="text-3xl mb-3">AI</div>
                  <p className="text-sm font-medium text-slate-500">GBP Dashboard Assistant</p>
                  <p className="text-xs mt-1 max-w-[220px] leading-relaxed text-slate-400">
                    Ask about rankings, reviews, posts, or business performance metrics.
                  </p>
                </div>
              )}

              {connectError && messages.length === 0 && (
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
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-[#1a2b4a] text-white text-[9px] font-bold flex items-center justify-center shrink-0 mr-2 mt-0.5 select-none">
                      AI
                    </div>
                  )}

                  <div
                    className={[
                      'max-w-[76%] text-sm px-3 py-2 rounded-2xl leading-relaxed whitespace-pre-wrap',
                      msg.role === 'user'
                        ? 'bg-[#0ea5e9] text-white rounded-br-sm'
                        : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm shadow-sm',
                    ].join(' ')}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {status === 'thinking' && (
                <div className="flex justify-start">
                  <div className="w-6 h-6 rounded-full bg-[#1a2b4a] text-white text-[9px] font-bold flex items-center justify-center shrink-0 mr-2 mt-0.5 select-none">
                    AI
                  </div>
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
              )}

              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendText();
              }}
              className="shrink-0 flex items-center gap-2 px-3 py-3 border-t bg-white border-slate-100"
            >
              <input
                type="text"
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder="Type a message..."
                className="flex-1 text-sm bg-slate-100 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-400/60 text-slate-700 placeholder-slate-400 transition-shadow"
              />

              <button
                type="submit"
                disabled={!canSend}
                title="Send"
                className="shrink-0 p-2 rounded-xl bg-[#0ea5e9] text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>

            {(status !== 'idle' || messages.length > 0) && (
              <div className="shrink-0 px-4 py-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 bg-white">
                <div className="flex gap-3">
                  <span>
                    Daily Usage: <b className="text-slate-600">{dailyUsage} / {MAX_RPD}</b>
                  </span>
                  <span>Status: {statusLabel}</span>
                </div>
                <span className="italic">3.1 Flash-Lite</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => {
            const nextOpen = !isOpen;
            setIsOpen(nextOpen);
            if (nextOpen && status === 'idle') setStatus('ready');
          }}
          aria-label={isOpen ? 'Close GBP Assistant' : 'Open GBP Assistant'}
          className={fabClass}
        >
          {isOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
              />
            </svg>
          )}
        </button>
      </div>
    </>
  );
}
