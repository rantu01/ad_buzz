"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SmilePlus } from "lucide-react";
import { ALLOWED_REACTIONS, reactionSummary } from "@/lib/groupChat";
import { positionWithinViewport } from "@/lib/popoverPosition";

// The picker is rendered through a portal because message feeds scroll with
// `overflow: auto`, which would otherwise clip a picker opened near the top or
// the edge of a bubble. Placement is clamped to the visible viewport.
function positionFor(anchor, width, height, align) {
  return positionWithinViewport(anchor, width, height, align, {
    width: typeof window === "undefined" ? 1024 : window.innerWidth,
    height: typeof window === "undefined" ? 768 : window.innerHeight,
  });
}

function MessageReactions({ reactions, uid, onReact, compact = false, align = "left" }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const pickerRef = useRef(null);
  const summary = useMemo(() => reactionSummary(reactions), [reactions]);

  const reposition = useCallback(() => {
    const anchor = triggerRef.current?.getBoundingClientRect();
    const element = pickerRef.current;
    if (!anchor || !element) return;
    const rect = element.getBoundingClientRect();
    setCoords(positionFor(anchor, rect.width, rect.height, align));
  }, [align]);

  const openPicker = useCallback(() => {
    const anchor = triggerRef.current?.getBoundingClientRect();
    if (!anchor || typeof window === "undefined") return;
    // First estimate avoids a flash at the origin; the rAF below measures the
    // real picker and corrects it before the user can interact with it.
    const narrow = window.innerWidth < 640;
    setCoords(positionFor(anchor, narrow ? 160 : 248, narrow ? 96 : 52, align));
    setPickerOpen(true);
  }, [align]);

  useEffect(() => {
    if (!pickerOpen) return;
    const frame = requestAnimationFrame(() => {
      reposition();
      pickerRef.current?.querySelector("button")?.focus();
    });
    const onPointerDown = (event) => {
      const target = event.target;
      if (pickerRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setPickerOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setPickerOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [pickerOpen, reposition]);

  if (!onReact) return null;

  const choose = (emoji) => {
    onReact(emoji);
    setPickerOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className={`mt-1 flex max-w-full flex-wrap items-center gap-1 ${compact ? "text-[11px]" : "text-xs"}`}>
      {summary.map(({ emoji, count, uids }) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          aria-pressed={uids.includes(uid)}
          aria-label={`${emoji} reaction, ${count}. ${uids.includes(uid) ? "Remove yours" : "Add yours"}`}
          className={`flex min-h-7 items-center gap-1 rounded-full border px-2 py-0.5 transition ${uids.includes(uid) ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          <span aria-hidden="true">{emoji}</span>
          <span className="font-semibold tabular-nums">{count}</span>
        </button>
      ))}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
        aria-expanded={pickerOpen}
        aria-label="Add reaction"
        className="flex min-h-7 min-w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
      >
        <SmilePlus size={13} />
      </button>
      {pickerOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={pickerRef}
          role="group"
          aria-label="Choose a reaction"
          className="z-[130] grid w-[min(10rem,calc(100vw-1rem))] grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl sm:flex sm:w-auto sm:gap-0.5"
          style={{ position: "fixed", left: coords?.left ?? -9999, top: coords?.top ?? -9999, visibility: coords ? "visible" : "hidden", maxWidth: "calc(100vw - 1rem)" }}
        >
          {ALLOWED_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => choose(emoji)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default React.memo(MessageReactions);
