'use client';

/**
 * GeminiLiveChat — Floating dashboard assistant powered by Gemini 2.5 Flash Live API.
 *
 * Features
 * ─────────
 * • WebSocket connection to Gemini 2.5 Flash BidiGenerateContent endpoint
 * • Text chat with clientContent turn payloads
 * • Push-to-Talk via Spacebar → raw 16-bit PCM @ 16 kHz sent as realtimeInput
 * • Continuous camera feed → 1 FPS JPEG frames sent as realtimeInput
 * • Pulsing red UI state while mic is active
 * • Text transcript surfaced from outputTranscription / modelTurn parts
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type WsStatus = 'disconnected' | 'connecting' | 'connected';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  partial?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert Web Audio Float32 samples to signed 16-bit PCM integers. */
function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}

/** Encode an ArrayBuffer as a base64 string. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode a base64 string into 16-bit PCM samples. */
function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

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
async function fetchGBPReviews(): Promise<unknown> {
  try {
    const res = await fetch('/api/gbp/reviews');
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: `Failed to fetch reviews: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Fetch published posts from all enabled GBP locations. */
async function fetchGBPPosts(): Promise<unknown> {
  try {
    const res = await fetch('/api/gbp/posts');
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

// Current Live API model — confirmed working as of June 2026.
// Override via NEXT_PUBLIC_GEMINI_LIVE_MODEL env var.
const LIVE_MODEL =
  process.env.NEXT_PUBLIC_GEMINI_LIVE_MODEL ||
  'models/gemini-3.1-flash-live-preview';

// Built lazily inside connectWS so we can surface a clear error if the key is missing.
function buildWsUrl(): string {
  const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is not set. Add it to .env.local and restart the dev server.');
  // Official Live API WebSocket endpoint — v1beta per Google documentation.
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;
}

// ─── Tool Definitions for Function Calling ───────────────────────────────────

/**
 * Tools available to Gemini for fetching real-time data from the GBP Manager app.
 * Each tool definition specifies what the tool does and what parameters it accepts.
 */
const TOOLS = [
  {
    functionDeclarations: [
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

// outputAudioTranscription is a top-level setup field (NOT inside generationConfig).
// Tools enable Gemini to fetch real-time data from your app.
function buildSetupPayload(userEmail: string | null): string {
  return JSON.stringify({
    setup: {
      model: LIVE_MODEL,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' },
          },
        },
      },
      outputAudioTranscription: {},
      tools: TOOLS,
      systemInstruction: {
        parts: [
          {
            text: userEmail
              ? `You are an AI assistant for GBP Manager, a Google Business Profile management tool. 
                 You have read-only access to the user's GBP data via function calls. 
                 You can read locations, performance metrics, reviews, and published posts.
                 Never claim you can publish posts, write review replies, modify settings, or change data.
                 Current user email: ${userEmail}
                 When the user asks about their GBP data, use the available read-only tools to fetch current information.`
              : `You are a helpful GBP Manager assistant.
                 You have read-only access to saved app data via function calls, including locations, reviews, and published posts.
                 Never claim you can publish posts, write review replies, modify settings, or change data.
                 When the user asks about their GBP data, use the available read-only tools to fetch current information.`,
          },
        ],
      },
    },
  });
}

const CAM_W = 320;
const CAM_H = 240;
const FRAME_INTERVAL_MS = 1000; // 1 FPS
const PCM_BUFFER_SIZE = 4096;
const INPUT_AUDIO_RATE = 16_000;
const OUTPUT_AUDIO_RATE = 24_000;

// ─── Component ────────────────────────────────────────────────────────────────

export default function GeminiLiveChat() {
  // ── UI state ─────────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const [connectError, setConnectError] = useState<string | null>(null);

  // Prevent re-entry: tracks whether the last connection attempt ended in failure
  // so we never auto-retry in a loop.
  const connectionFailedRef = useRef(false);

  // ── Mutable refs (no re-render needed) ───────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackTimeRef = useRef(0);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Camera
  const videoRef = useRef<HTMLVideoElement | null>(null);       // always mounted, hidden
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null); // offscreen – JPEG extraction
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null); // visible preview inside panel
  const camStreamRef = useRef<MediaStream | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // PTT guard
  const spaceHeldRef = useRef(false);

  // Scroll anchor
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const stopAssistantAudio = useCallback(() => {
    playbackSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source may have already ended.
      }
    });
    playbackSourcesRef.current.clear();
    playbackTimeRef.current = outputAudioCtxRef.current?.currentTime ?? 0;
  }, []);

  const playAssistantAudio = useCallback(async (base64Audio: string) => {
    const ctx = outputAudioCtxRef.current ?? new AudioContext();
    outputAudioCtxRef.current = ctx;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const pcm = base64ToInt16(base64Audio);
    if (pcm.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, pcm.length, OUTPUT_AUDIO_RATE);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      channel[i] = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff);
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => playbackSourcesRef.current.delete(source);

    const startAt = Math.max(ctx.currentTime, playbackTimeRef.current);
    playbackTimeRef.current = startAt + audioBuffer.duration;
    playbackSourcesRef.current.add(source);
    source.start(startAt);
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const connectWS = useCallback(() => {
    // Already open or mid-handshake — do nothing
    const state = wsRef.current?.readyState;
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;

    connectionFailedRef.current = false;
    setConnectError(null);

    let wsUrl: string;
    try {
      wsUrl = buildWsUrl();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[GeminiLive] Configuration error:', msg);
      setConnectError(msg);
      setWsStatus('disconnected');
      return;
    }

    setWsStatus('connecting');
    const ws = new WebSocket(wsUrl);
    // Gemini Live sends ALL frames (JSON + audio) as binary WebSocket frames.
    // ArrayBuffer is synchronous; Blob would require async .text() which complicates the handler.
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    // Get user email for tool context
    const userEmail = getUserEmail();

    ws.onopen = () => {
      console.log('[GeminiLive] WebSocket connected, sending setup...');
      try {
        const setupPayload = buildSetupPayload(userEmail);
        ws.send(setupPayload);
      } catch (err) {
        console.error('[GeminiLive] Failed to send setup payload:', err);
        setConnectError(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
        ws.close();
      }
    };

    ws.onmessage = (ev) => {
      // Decode binary frames as UTF-8 text (Gemini sends everything as binary frames).
      // If decoding fails or the result isn't JSON, it's raw audio PCM — discard it.
      let raw: string;
      if (ev.data instanceof ArrayBuffer) {
        raw = new TextDecoder().decode(ev.data);
      } else {
        raw = ev.data as string;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        return; // Raw PCM audio or other non-JSON binary — ignore
      }

      // setupComplete → session is ready; update status
      if (data.setupComplete !== undefined) {
        console.log('[GeminiLive] Setup complete, session ready');
        setWsStatus('connected');
        return;
      }

      // Handle errors from the server
      if (data.error !== undefined) {
        const errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        console.error('[GeminiLive] Server error:', errorMsg);
        setConnectError(`Server error: ${errorMsg}`);
        return;
      }

      // Handle tool calls: Gemini requesting data from our APIs
      if (data.toolCall !== undefined) {
        const toolCall = data.toolCall as Record<string, unknown>;
        const functionCalls = toolCall.functionCalls as Array<{
          id: string;
          name: string;
          args: Record<string, unknown>;
        }>;

        // Execute all requested functions in parallel
        Promise.all(
          functionCalls.map(async (fc) => {
            console.log(`[GeminiLive] Tool call: ${fc.name}`, fc.args);

            let result: unknown;
            try {
              if (fc.name === 'getGBPLocations') {
                result = await fetchGBPLocations();
              } else if (fc.name === 'getLocationPerformance') {
                const email = fc.args.email as string | undefined || userEmail;
                const locationName = fc.args.locationName as string;
                const days = (fc.args.days as number | undefined) || 7;
                if (!email) {
                  result = { error: 'Performance data requires the Google email for the location. Call getGBPLocations first and use that location email.' };
                } else {
                  result = await fetchLocationPerformance(email, locationName, days);
                }
              } else if (fc.name === 'getGBPReviews') {
                result = await fetchGBPReviews();
              } else if (fc.name === 'getGBPPosts') {
                result = await fetchGBPPosts();
              } else {
                result = { error: `Unknown tool: ${fc.name}` };
              }
            } catch (err) {
              result = { error: `Tool error: ${err instanceof Error ? err.message : String(err)}` };
            }

            // Send tool response back to Gemini
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  toolResponse: {
                    functionResponses: [
                      {
                        id: fc.id,
                        response: result,
                      },
                    ],
                  },
                }),
              );
            }
          }),
        ).catch((err) => console.error('[GeminiLive] Tool execution error:', err));

        return;
      }

      const sc = data?.serverContent as Record<string, unknown> | undefined;
      if (!sc) return;

      // Pull text from modelTurn parts
      const parts = (sc.modelTurn as Record<string, unknown> | undefined)?.parts as
        | Array<Record<string, unknown>>
        | undefined;

      if (sc.interrupted) {
        stopAssistantAudio();
      }

      parts?.forEach((part) => {
        const inlineData = part.inlineData as Record<string, unknown> | undefined;
        const mimeType = inlineData?.mimeType as string | undefined;
        const data = inlineData?.data as string | undefined;
        if (data && mimeType?.startsWith('audio/pcm')) {
          playAssistantAudio(data).catch((err) => {
            console.error('[GeminiLive] Audio playback failed:', err);
          });
        }
      });

      const partText = parts?.find((p) => typeof p.text === 'string')?.text as
        | string
        | undefined;

      // Pull text from outputTranscription
      const transcriptText = (
        sc.outputTranscription as Record<string, unknown> | undefined
      )?.text as string | undefined;

      const fragment = partText ?? transcriptText;

      if (fragment) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.partial) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + fragment },
            ];
          }
          return [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              role: 'assistant',
              text: fragment,
              partial: true,
            },
          ];
        });
      }

      // Mark last assistant message as complete
      if (sc.turnComplete) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.partial) {
            return [...prev.slice(0, -1), { ...last, partial: false }];
          }
          return prev;
        });
      }
    };

    ws.onerror = (e) => {
      console.error('[GeminiLive] WebSocket error event:', e);
      connectionFailedRef.current = true;
      setWsStatus('disconnected');
      setConnectError('WebSocket connection error occurred');
      wsRef.current = null;
    };

    ws.onclose = (e) => {
      const clean = e.code === 1000;
      if (!clean) {
        connectionFailedRef.current = true;
        const reason = e.reason || `code ${e.code}`;
        const fullMsg = `[GeminiLive] WebSocket closed (${reason}). Model: ${LIVE_MODEL}, API key present: ${!!process.env.NEXT_PUBLIC_GEMINI_API_KEY}`;
        console.error(fullMsg);
        setConnectError(`Connection closed: ${reason}. Check your API key configuration.`);
      }
      setWsStatus('disconnected');
      wsRef.current = null;
    };
  }, [playAssistantAudio, stopAssistantAudio]);

  // Connect once on mount — no auto-retry loop.
  // Subsequent reconnects are manual (Reconnect button).
  useEffect(() => {
    connectWS();
    return () => {
      // Close the WS cleanly on unmount / HMR so we don't leave dangling connections.
      const ws = wsRef.current;
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close(1000);
      }
      wsRef.current = null;
    };
  }, [connectWS]);

  // Cleanup everything on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      audioCtxRef.current?.close();
      outputAudioCtxRef.current?.close();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    };
  }, []);

  // ── Push-To-Talk ──────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;

      // 16 kHz context for minimal-footprint PCM input
      const ctx = new AudioContext({ sampleRate: INPUT_AUDIO_RATE });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      // createScriptProcessor is deprecated but remains universally supported
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const proc = ctx.createScriptProcessor(PCM_BUFFER_SIZE, 1, 1);
      processorRef.current = proc;

      proc.onaudioprocess = (e) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        const pcm = float32ToInt16(e.inputBuffer.getChannelData(0));
        wsRef.current.send(
          JSON.stringify({
            realtimeInput: {
              // Use audio field (preferred over deprecated mediaChunks)
              audio: { mimeType: `audio/pcm;rate=${ctx.sampleRate}`, data: toBase64(pcm.buffer as ArrayBuffer) },
            },
          }),
        );
      };

      source.connect(proc);
      proc.connect(ctx.destination);
      setIsRecording(true);
    } catch (err) {
      console.error('[GeminiLive] Mic access denied:', err);
    }
  }, []);

  const stopMic = useCallback(() => {
    const hadOpenMic = Boolean(processorRef.current || micStreamRef.current);
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (hadOpenMic && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
    setIsRecording(false);
  }, []);

  // Global Spacebar → PTT (ignored when focus is in an input/textarea)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || spaceHeldRef.current || !isOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      spaceHeldRef.current = true;
      startMic();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceHeldRef.current = false;
      stopMic();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isOpen, startMic, stopMic]);

  // ── Camera ────────────────────────────────────────────────────────────────

  const toggleCamera = useCallback(async () => {
    if (isCameraActive) {
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsCameraActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: CAM_W, height: CAM_H, facingMode: 'environment' },
        audio: false,
      });
      camStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Lazily create the offscreen extraction canvas
      if (!captureCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = CAM_W;
        c.height = CAM_H;
        captureCanvasRef.current = c;
      }

      setIsCameraActive(true);

      frameTimerRef.current = setInterval(() => {
        const video = videoRef.current;
        const capture = captureCanvasRef.current;
        if (!video || !capture || video.readyState < 2) return;

        const captureCtx = capture.getContext('2d');
        if (!captureCtx) return;

        // Draw to extraction canvas
        captureCtx.drawImage(video, 0, 0, CAM_W, CAM_H);

        // Mirror to visible preview canvas (scaled to its display dimensions)
        const preview = previewCanvasRef.current;
        if (preview) {
          const pCtx = preview.getContext('2d');
          if (pCtx) pCtx.drawImage(capture, 0, 0, preview.width, preview.height);
        }

        // Encode and stream to Gemini Live
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const jpeg = capture.toDataURL('image/jpeg', 0.6).split(',')[1];
          // Use realtimeInput.video (preferred over deprecated mediaChunks)
          wsRef.current.send(
            JSON.stringify({
              realtimeInput: {
                video: { mimeType: 'image/jpeg', data: jpeg },
              },
            }),
          );
        }
      }, FRAME_INTERVAL_MS);
    } catch (err) {
      console.error('[GeminiLive] Camera access denied:', err);
    }
  }, [isCameraActive]);

  // ── Text send ─────────────────────────────────────────────────────────────

  const sendText = useCallback(() => {
    const text = inputText.trim();
    if (!text || wsRef.current?.readyState !== WebSocket.OPEN) return;

    setInputText('');
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-user`, role: 'user', text },
    ]);

    // gemini-3.1-flash-live-preview requires text via realtimeInput.text
    // (clientContent is only for initial history seeding on this model)
    wsRef.current.send(
      JSON.stringify({
        realtimeInput: { text },
      }),
    );
  }, [inputText]);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Derived display values ────────────────────────────────────────────────

  const statusDot =
    wsStatus === 'connected'
      ? 'bg-emerald-400'
      : wsStatus === 'connecting'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-slate-400';

  const panelBorder = isRecording
    ? 'border-red-500 shadow-red-300/40'
    : 'border-slate-200';

  const fabClass = [
    'w-14 h-14 rounded-full shadow-xl flex items-center justify-center',
    'transition-all duration-200 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    isRecording
      ? 'bg-red-500 shadow-red-400/50 animate-pulse scale-105 focus-visible:ring-red-400'
      : isOpen
        ? 'bg-[#1a2b4a] hover:bg-slate-700 shadow-slate-400/30 focus-visible:ring-slate-500'
        : 'bg-[#0ea5e9] hover:bg-sky-500 shadow-sky-400/40 focus-visible:ring-sky-400',
  ].join(' ');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/*
       * The video element must live outside the conditional panel so the ref is
       * always present for the camera frame-capture interval.
       * It is visually hidden via absolute + zero dimensions.
       */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      />

      {/* ── Fixed launcher + panel ─────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

        {/* ── Chat panel ──────────────────────────────────────────────── */}
        {isOpen && (
          <div
            className={`w-[380px] flex flex-col rounded-2xl shadow-2xl overflow-hidden border-2 transition-all duration-200 bg-white ${panelBorder}`}
            style={{ height: isCameraActive ? 580 : 500 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#1a2b4a] text-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                <span className="text-sm font-semibold tracking-tight truncate">
                  GBP Assistant
                </span>
                {isRecording && (
                  <span className="shrink-0 text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                    ● REC
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                {/* Camera toggle */}
                <button
                  onClick={toggleCamera}
                  title={isCameraActive ? 'Stop camera' : 'Start camera (visual context)'}
                  className={[
                    'p-1.5 rounded-lg transition-colors focus:outline-none',
                    isCameraActive
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-white/10',
                  ].join(' ')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8h8a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4a2 2 0 012-2z" />
                  </svg>
                </button>

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

            {/* Camera preview canvas */}
            {isCameraActive && (
              <div className="relative shrink-0 bg-black" style={{ height: 80 }}>
                <canvas
                  ref={previewCanvasRef}
                  width={380}
                  height={80}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-1.5 right-2 flex items-center gap-1 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full select-none">
                  <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />
                  Live · 1 FPS
                </div>
              </div>
            )}

            {/* Message list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50 scroll-smooth">
              {/* ── Connecting overlay (replaces empty state while socket is opening) ── */}
              {messages.length === 0 && wsStatus === 'connecting' && (
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
                  <p className="text-xs text-slate-400 font-medium">Connecting to Gemini Live…</p>
                </div>
              )}

              {/* ── Normal empty state (only after connection is ready) ── */}
              {messages.length === 0 && wsStatus === 'connected' && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-8 select-none">
                  <div className="text-3xl mb-3">🤖</div>
                  <p className="text-sm font-medium text-slate-500">GBP Dashboard Assistant</p>
                  <p className="text-xs mt-1 max-w-[220px] leading-relaxed text-slate-400">
                    Ask about rankings, reviews, posts, or business performance metrics.
                  </p>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-sm">
                    <kbd className="font-mono text-slate-600 bg-slate-100 border border-slate-200 rounded px-1 text-[11px]">
                      Space
                    </kbd>
                    <span className="text-slate-500">hold to speak</span>
                  </div>
                </div>
              )}

              {/* ── Disconnected empty state ── */}
              {messages.length === 0 && wsStatus === 'disconnected' && (
                <div className="flex flex-col items-center justify-center h-full text-center select-none gap-2 px-4">
                  <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p className="text-xs text-slate-500 font-medium">Not connected</p>
                  {connectError && (
                    <p className="text-[11px] text-red-400 bg-red-50 border border-red-100 rounded-lg px-3 py-2 max-w-full break-words leading-relaxed">
                      {connectError}
                    </p>
                  )}
                  <button
                    onClick={connectWS}
                    className="text-xs text-sky-500 hover:underline focus:outline-none mt-1"
                  >
                    Reconnect
                  </button>
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
                    {/* Typing indicator dots while streaming */}
                    {msg.partial && (
                      <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
                        {[0, 150, 300].map((delay) => (
                          <span
                            key={delay}
                            className="w-1 h-1 rounded-full bg-current animate-bounce"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              <div ref={bottomRef} />
            </div>

            {/* Recording active banner */}
            {isRecording && (
              <div className="shrink-0 px-4 py-1.5 bg-red-50 border-t border-red-200 flex items-center gap-2 text-red-600 text-xs">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
                Recording… release{' '}
                <kbd className="font-mono bg-white border border-red-200 rounded px-1">Space</kbd>{' '}
                to send
              </div>
            )}

            {/* Input bar */}
            <div
              className={[
                'shrink-0 flex items-center gap-2 px-3 py-3 border-t bg-white transition-colors',
                isRecording ? 'border-red-300 bg-red-50/40' : 'border-slate-100',
              ].join(' ')}
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
                disabled={!inputText.trim() || wsStatus !== 'connected'}
                title="Send (Enter)"
                className="shrink-0 p-2 rounded-xl bg-[#0ea5e9] text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>

            {/* Reconnect footer — only shown when disconnected AND there are existing messages */}
            {wsStatus === 'disconnected' && messages.length > 0 && (
              <div className="shrink-0 px-4 py-2 text-center text-xs text-slate-400 border-t border-slate-100 bg-white">
                <button
                  onClick={connectWS}
                  className="text-sky-500 hover:underline focus:outline-none"
                >
                  Connection lost — Reconnect
                </button>
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
