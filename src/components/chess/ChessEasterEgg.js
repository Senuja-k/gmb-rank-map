"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ChessGame = dynamic(() => import("./ChessGame"), {
  ssr: false,
  loading: () => <div className="p-6 text-sm font-medium text-slate-600">Loading chess\u2026</div>,
});

export default function ChessEasterEgg({ isOpen, onClose }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [isRevealing, setIsRevealing] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const revealTimer = window.setTimeout(() => setIsRevealing(false), 1500);
    document.body.style.overflow = "hidden";
    queueMicrotask(() => setIsRevealing(true));
    window.setTimeout(() => closeButtonRef.current?.focus(), 900);

    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(revealTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="chess-easter-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-3 py-6 backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <div className="chess-easter-sweep" aria-hidden="true" />
      <div className="chess-easter-flash" aria-hidden="true" />
      <div className="chess-easter-pieces" aria-hidden="true">
        {["\u2654", "\u2655", "\u2656", "\u2658", "\u2657"].map((piece, index) => (
          <span key={piece} style={{ "--piece-index": index }}>{piece}</span>
        ))}
      </div>
      {isRevealing && (
        <div className="chess-easter-reveal" aria-hidden="true">
          {Array.from({ length: 64 }, (_, index) => (
            <span key={index} style={{ "--square-delay": `${(index % 8) * 18 + Math.floor(index / 8) * 16}ms` }} />
          ))}
        </div>
      )}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Chess easter egg"
        className="relative max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-xl bg-white p-4 shadow-2xl sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close chess"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <span aria-hidden="true" className="text-xl leading-none">x</span>
        </button>
        <div className="pr-8">
          {!isRevealing && <ChessGame />}
        </div>
      </div>
    </div>,
    document.body
  );
}
