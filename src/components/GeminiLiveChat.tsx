'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  partial?: boolean;
}

type LiveStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

const CHAT_MODEL = 'gemini-3.1-flash-live-preview';
const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const MODEL_USAGE_KEY = 'gbp_model_usage';
const MAX_RPD = 20;
const LIVE_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

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

function getUsageToday(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = JSON.parse(localStorage.getItem(MODEL_USAGE_KEY) ?? '{}');
    const today = new Date().toISOString().slice(0, 10);
    const entry = raw[CHAT_MODEL];
    return entry?.date === today ? entry.used : 0;
  } catch {
    return 0;
  }
}

function trackRequest() {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.parse(localStorage.getItem(MODEL_USAGE_KEY) ?? '{}');
    const today = new Date().toISOString().slice(0, 10);
    const entry = raw[CHAT_MODEL];
    raw[CHAT_MODEL] = { date: today, used: (entry?.date === today ? entry.used : 0) + 1 };
    localStorage.setItem(MODEL_USAGE_KEY, JSON.stringify(raw));
  } catch {}
}

function getSystemInstruction(userEmail: string | null): string {
  return userEmail
    ? `You are an AI assistant for GBP Manager.
You can answer questions about rankings, reviews, posts, and performance metrics using context provided by the user.
STRICTLY READ-ONLY: Never claim you can publish, reply, or modify data.
Current user: ${userEmail}`
    : `You are a GBP Manager assistant.
You can answer questions about rankings, reviews, posts, and performance metrics using context provided by the user.
STRICTLY READ-ONLY: Never claim you can modify data.`;
}

function buildSetupMessage() {
  return {
    setup: {
      model: `models/${CHAT_MODEL}`,
      generationConfig: {
        responseModalities: ['TEXT'],
      },
      systemInstruction: {
        parts: [{ text: getSystemInstruction(getUserEmail()) }],
      },
    },
  };
}

function buildTextTurn(text: string) {
  return {
    clientContent: {
      turns: [
        {
          role: 'user',
          parts: [{ text }],
        },
      ],
      turnComplete: true,
    },
  };
}

export default function GeminiLiveChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [dailyUsage, setDailyUsage] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');

  const websocketRef = useRef<WebSocket | null>(null);
  const setupCompleteRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const pendingTurnsRef = useRef<string[]>([]);
  const activeAssistantIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const appendAssistantText = useCallback((text: string) => {
    if (!text) return;

    setMessages((prev) => {
      const activeId = activeAssistantIdRef.current;
      if (activeId) {
        return prev.map((msg) =>
          msg.id === activeId ? { ...msg, text: `${msg.text}${text}`, partial: true } : msg
        );
      }

      const id = `${Date.now()}-ai`;
      activeAssistantIdRef.current = id;
      return [...prev, { id, role: 'assistant', text, partial: true }];
    });
  }, []);

  const finishAssistantTurn = useCallback(() => {
    const activeId = activeAssistantIdRef.current;
    if (activeId) {
      setMessages((prev) => prev.map((msg) => (msg.id === activeId ? { ...msg, partial: false } : msg)));
    }
    activeAssistantIdRef.current = null;
    requestInFlightRef.current = false;
    setIsThinking(false);
  }, []);

  const sendQueuedTurns = useCallback(() => {
    const ws = websocketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !setupCompleteRef.current) return;

    while (pendingTurnsRef.current.length > 0) {
      const text = pendingTurnsRef.current.shift();
      if (text) ws.send(JSON.stringify(buildTextTurn(text)));
    }
  }, []);

  const handleLiveMessage = useCallback(
    (event: MessageEvent) => {
      let response: any;
      try {
        response = JSON.parse(event.data);
      } catch {
        return;
      }

      if (response.setupComplete) {
        setupCompleteRef.current = true;
        setLiveStatus('connected');
        setConnectError(null);
        sendQueuedTurns();
        return;
      }

      if (response.serverContent) {
        const serverContent = response.serverContent;
        const parts = serverContent.modelTurn?.parts ?? [];
        const modelText = parts.map((part: any) => part.text).filter(Boolean).join('');
        const transcriptText = serverContent.outputTranscription?.text ?? '';
        appendAssistantText(modelText || transcriptText);

        if (serverContent.turnComplete || serverContent.generationComplete) {
          finishAssistantTurn();
        }
      }

      if (response.goAway) {
        setConnectError('Gemini Live session is closing. Reopen the assistant to start a new session.');
      }
    },
    [appendAssistantText, finishAssistantTurn, sendQueuedTurns]
  );

  const connectLiveSession = useCallback(() => {
    if (!API_KEY) {
      setLiveStatus('error');
      setConnectError('Missing NEXT_PUBLIC_GEMINI_API_KEY. Native browser Live API WebSockets require a public or ephemeral client token.');
      return;
    }

    const existing = websocketRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;

    setLiveStatus('connecting');
    setupCompleteRef.current = false;

    const ws = new WebSocket(`${LIVE_WS_URL}?key=${encodeURIComponent(API_KEY)}`);
    websocketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify(buildSetupMessage()));
    };

    ws.onmessage = handleLiveMessage;

    ws.onerror = () => {
      setLiveStatus('error');
      setConnectError('Gemini Live WebSocket connection failed.');
      requestInFlightRef.current = false;
      setIsThinking(false);
    };

    ws.onclose = () => {
      websocketRef.current = null;
      setupCompleteRef.current = false;
      requestInFlightRef.current = false;
      setIsThinking(false);
      setLiveStatus((status) => (status === 'error' ? 'error' : 'closed'));
    };
  }, [handleLiveMessage]);

  useEffect(() => {
    setDailyUsage(getUsageToday());
    connectLiveSession();

    return () => {
      const ws = websocketRef.current;
      websocketRef.current = null;
      setupCompleteRef.current = false;
      pendingTurnsRef.current = [];
      requestInFlightRef.current = false;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [connectLiveSession]);

  const sendText = useCallback(
    (text: string) => {
      if (!text || requestInFlightRef.current) return;

      const ws = websocketRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        connectLiveSession();
      }

      requestInFlightRef.current = true;
      activeAssistantIdRef.current = null;
      setConnectError(null);
      setIsThinking(true);
      setInputText('');
      setMessages((prev) => [...prev, { id: `${Date.now()}-user`, role: 'user', text }]);

      const readyWs = websocketRef.current;
      if (readyWs?.readyState === WebSocket.OPEN && setupCompleteRef.current) {
        readyWs.send(JSON.stringify(buildTextTurn(text)));
      } else {
        pendingTurnsRef.current.push(text);
      }

      trackRequest();
      setDailyUsage(getUsageToday());
    },
    [connectLiveSession]
  );

  const handleManualSend = useCallback(() => {
    if (requestInFlightRef.current || isThinking) return;

    const text = inputText.trim();
    if (!text) return;

    sendText(text);
  }, [inputText, isThinking, sendText]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const isConnected = liveStatus === 'connected';
  const canSend = Boolean(inputText.trim()) && !isThinking && liveStatus !== 'error';
  const statusDot = isConnected ? 'bg-emerald-400' : liveStatus === 'connecting' ? 'bg-amber-400' : 'bg-slate-400';
  const panelBorder = 'border-slate-200';
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
            className={`w-[380px] flex flex-col rounded-2xl shadow-2xl overflow-hidden border-2 transition-all duration-200 bg-white ${panelBorder}`}
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
              {messages.length === 0 && liveStatus === 'connecting' && (
                <div className="flex flex-col items-center justify-center h-full text-center select-none gap-3">
                  <div className="flex items-center gap-1.5">
                    {[0, 160, 320].map((delay) => (
                      <span
                        key={delay}
                        className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 font-medium">Connecting to Gemini Live...</p>
                </div>
              )}

              {messages.length === 0 && liveStatus !== 'connecting' && !connectError && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-8 select-none">
                  <div className="text-3xl mb-3">AI</div>
                  <p className="text-sm font-medium text-slate-500">GBP Dashboard Assistant</p>
                  <p className="text-xs mt-1 max-w-[220px] leading-relaxed text-slate-400">
                    Ask about rankings, reviews, posts, or business performance metrics.
                  </p>
                </div>
              )}

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
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-[#1a2b4a] text-white text-[9px] font-bold flex items-center justify-center shrink-0 mr-2 mt-0.5 select-none">
                      AI
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
              ))}

              {isThinking && (
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
                handleManualSend();
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
                type="button"
                onClick={() => {
                  handleManualSend();
                }}
                disabled={!canSend}
                title="Send"
                className="shrink-0 p-2 rounded-xl bg-[#0ea5e9] text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>

            {(liveStatus !== 'idle' || messages.length > 0) && (
              <div className="shrink-0 px-4 py-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 bg-white">
                <div className="flex gap-3">
                  <span>
                    Daily Usage: <b className="text-slate-600">{dailyUsage} / {MAX_RPD}</b>
                  </span>
                  <span>Status: {liveStatus}</span>
                </div>
                <span className="italic">{CHAT_MODEL}</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setIsOpen((value) => !value)}
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
