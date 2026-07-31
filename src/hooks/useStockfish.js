"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ENGINE_URL = "/stockfish/stockfish-18-lite-single.js";
const STARTUP_TIMEOUT_MS = 10000;

function parseBestMove(line) {
  const match = line.match(/^bestmove\s+(\S+)/);
  if (!match || match[1] === "(none)") return null;

  const move = match[1];
  if (move.length < 4) return null;

  return {
    from: move.slice(0, 2),
    to: move.slice(2, 4),
    promotion: move[4] || undefined,
  };
}

export function useStockfish({ elo = 1200, moveTime = 400, instanceKey = 0 } = {}) {
  const workerRef = useRef(null);
  const readyResolverRef = useRef(null);
  const pendingRef = useRef(null);
  const generationRef = useRef(0);
  const startupTimerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState("");

  const post = useCallback((command) => {
    if (workerRef.current) {
      workerRef.current.postMessage(command);
    }
  }, []);

  const rejectPending = useCallback((message) => {
    if (pendingRef.current) {
      pendingRef.current.reject(new Error(message));
      pendingRef.current = null;
    }
    setIsThinking(false);
  }, []);

  const configureEngine = useCallback(() => {
    post("setoption name UCI_LimitStrength value true");
    post(`setoption name UCI_Elo value ${elo}`);
    post("ucinewgame");
    post("isready");
  }, [elo, post]);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      queueMicrotask(() => setError("Engine failed to load"));
      console.error("Stockfish worker is not available in this browser.");
      return undefined;
    }

    let cancelled = false;
    const worker = new Worker(ENGINE_URL);
    workerRef.current = worker;
    queueMicrotask(() => {
      setIsReady(false);
      setError("");
    });

    startupTimerRef.current = window.setTimeout(() => {
      if (cancelled) return;
      queueMicrotask(() => setError("Engine failed to load"));
      rejectPending("Stockfish startup timed out.");
      console.error("Stockfish did not become ready within the startup timeout.");
      readyResolverRef.current?.();
      readyResolverRef.current = null;
      worker.terminate();
      workerRef.current = null;
    }, STARTUP_TIMEOUT_MS);

    worker.onerror = (event) => {
      if (cancelled) return;
      queueMicrotask(() => setError("Engine failed to load"));
      rejectPending("Stockfish worker failed to load.");
      console.error("Stockfish worker error:", event);
    };

    worker.onmessage = (event) => {
      const line = String(event.data || "").trim();
      if (!line) return;

      if (line === "uciok") {
        configureEngine();
        return;
      }

      if (line === "readyok") {
        if (startupTimerRef.current) {
          window.clearTimeout(startupTimerRef.current);
          startupTimerRef.current = null;
        }
        setIsReady(true);
        readyResolverRef.current?.();
        readyResolverRef.current = null;
        return;
      }

      if (line.startsWith("bestmove")) {
        const pending = pendingRef.current;
        if (!pending) return;

        pendingRef.current = null;
        setIsThinking(false);

        if (pending.generation !== generationRef.current) {
          return;
        }

        pending.resolve(parseBestMove(line));
      }
    };

    worker.postMessage("uci");

    return () => {
      cancelled = true;
      generationRef.current += 1;
      if (startupTimerRef.current) {
        window.clearTimeout(startupTimerRef.current);
        startupTimerRef.current = null;
      }
      rejectPending("Stockfish worker closed.");
      worker.terminate();
      workerRef.current = null;
      readyResolverRef.current = null;
    };
  }, [configureEngine, instanceKey, rejectPending]);

  const waitUntilReady = useCallback(() => {
    if (isReady) return Promise.resolve();
    return new Promise((resolve) => {
      readyResolverRef.current = resolve;
    });
  }, [isReady]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    post("stop");
    rejectPending("Stockfish search stopped.");
  }, [post, rejectPending]);

  const newGame = useCallback(() => {
    generationRef.current += 1;
    post("stop");
    rejectPending("Stockfish game reset.");
    setIsReady(false);
    post("ucinewgame");
    post(`setoption name UCI_Elo value ${elo}`);
    post("isready");
  }, [elo, post, rejectPending]);

  const requestBestMove = useCallback(
    async (fen) => {
      if (!workerRef.current || error) {
        throw new Error("Stockfish is not available.");
      }

      if (pendingRef.current) {
        post("stop");
        rejectPending("Stockfish search replaced.");
      }

      const generation = generationRef.current;
      await waitUntilReady();

      if (generation !== generationRef.current || !workerRef.current || error) {
        return null;
      }

      setIsThinking(true);

      return new Promise((resolve, reject) => {
        pendingRef.current = { resolve, reject, generation };
        post(`position fen ${fen}`);
        post(`go movetime ${moveTime}`);
      });
    },
    [error, moveTime, post, rejectPending, waitUntilReady]
  );

  return {
    isReady,
    isThinking,
    error,
    requestBestMove,
    stop,
    newGame,
  };
}

