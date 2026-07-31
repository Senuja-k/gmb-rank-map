"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useStockfish } from "@/hooks/useStockfish";

const DIFFICULTIES = {
  easy: { label: "Easy", elo: 900, moveTime: 150 },
  normal: { label: "Normal", elo: 1200, moveTime: 400 },
  hard: { label: "Hard", elo: 1600, moveTime: 700 },
};

function getStatus(game, isReady, isThinking, engineError) {
  if (engineError) return "Engine failed to load";
  if (!isReady) return "Engine loading\u2026";
  if (game.isCheckmate()) return game.turn() === "b" ? "Checkmate \u2014 You win" : "Checkmate \u2014 Computer wins";
  if (game.isStalemate()) return "Stalemate";
  if (game.isThreefoldRepetition()) return "Threefold repetition";
  if (game.isInsufficientMaterial()) return "Insufficient material";
  if (game.isDraw()) return "Draw";
  if (game.isCheck()) return "Check";
  if (isThinking) return "Computer is thinking\u2026";
  return game.turn() === "w" ? "Your turn" : "Computer is thinking\u2026";
}

export { DIFFICULTIES };

export default function ChessGame() {
  const [difficulty, setDifficulty] = useState("normal");
  const [engineKey, setEngineKey] = useState(0);
  const gameRef = useRef(new Chess());
  const resetTokenRef = useRef(0);
  const [fen, setFen] = useState(() => new Chess().fen());
  const [moveError, setMoveError] = useState("");
  const selectedDifficulty = DIFFICULTIES[difficulty];
  const { isReady, isThinking, error, requestBestMove, stop, newGame } = useStockfish({
    elo: selectedDifficulty.elo,
    moveTime: selectedDifficulty.moveTime,
    instanceKey: engineKey,
  });

  const resetBoard = useCallback(() => {
    resetTokenRef.current += 1;
    stop();
    gameRef.current = new Chess();
    setFen(gameRef.current.fen());
    setMoveError("");
    newGame();
  }, [newGame, stop]);

  const runEngineMove = useCallback(
    async (token) => {
      window.setTimeout(async () => {
        if (token !== resetTokenRef.current || gameRef.current.turn() !== "b" || gameRef.current.isGameOver()) {
          return;
        }

        try {
          const bestMove = await requestBestMove(gameRef.current.fen());
          if (!bestMove || token !== resetTokenRef.current || gameRef.current.turn() !== "b" || gameRef.current.isGameOver()) {
            return;
          }

          gameRef.current.move(bestMove);
          setFen(gameRef.current.fen());
        } catch (err) {
          if (token === resetTokenRef.current) {
            console.error("Stockfish move failed:", err);
            setMoveError("Computer move failed. Try a new game.");
          }
        }
      }, 180);
    },
    [requestBestMove]
  );

  const tryMove = useCallback((sourceSquare, targetSquare) => {
    if (!targetSquare || isThinking || gameRef.current.isGameOver() || gameRef.current.turn() !== "w") {
      return false;
    }

    try {
      const move = gameRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (!move) return false;

      setMoveError("");
      setFen(gameRef.current.fen());
      runEngineMove(resetTokenRef.current);
      return true;
    } catch {
      setMoveError("Illegal move");
      return false;
    }
  }, [isThinking, runEngineMove]);

  function changeDifficulty(nextDifficulty) {
    if (nextDifficulty === difficulty) return;
    resetTokenRef.current += 1;
    stop();
    gameRef.current = new Chess();
    setFen(gameRef.current.fen());
    setMoveError("");
    setDifficulty(nextDifficulty);
    setEngineKey((value) => value + 1);
  }


  const boardOptions = useMemo(
    () => ({
      id: `hidden-chess-${engineKey}`,
      position: fen,
      boardOrientation: "white",
      animationDurationInMs: 180,
      allowDrawingArrows: false,
      allowDragOffBoard: false,
      boardStyle: {
        borderRadius: 8,
        boxShadow: "0 18px 45px rgba(15, 23, 42, 0.22)",
        overflow: "hidden",
      },
      lightSquareStyle: { backgroundColor: "#e8edf4" },
      darkSquareStyle: { backgroundColor: "#5f7fa4" },
      canDragPiece: ({ piece, square }) =>
        !isThinking &&
        !gameRef.current.isGameOver() &&
        gameRef.current.turn() === "w" &&
        square &&
        piece?.pieceType?.startsWith("w"),
      onPieceDrop: ({ sourceSquare, targetSquare }) => tryMove(sourceSquare, targetSquare),
    }),
    [engineKey, fen, isThinking, tryMove]
  );

  const status = getStatus(new Chess(fen), isReady, isThinking, error);

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Hidden game</p>
          <h2 className="text-xl font-bold text-slate-900">Chess</h2>
        </div>
        <button
          type="button"
          onClick={resetBoard}
          className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
        >
          New Game
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.entries(DIFFICULTIES).map(([key, item]) => (
          <button
            key={key}
            type="button"
            onClick={() => changeDifficulty(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              difficulty === key
                ? "bg-sky-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
        {status}
        {moveError && !error ? <span className="ml-2 text-red-600">{moveError}</span> : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Engine failed to load</p>
          <p className="mt-1 text-red-600">Close and reopen the chess board, or try again below.</p>
          <button
            type="button"
            onClick={() => setEngineKey((value) => value + 1)}
            className="mt-3 rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <div key={engineKey} className="mx-auto w-full max-w-[480px]">
          <Chessboard options={boardOptions} />
        </div>
      )}
    </div>
  );
}
