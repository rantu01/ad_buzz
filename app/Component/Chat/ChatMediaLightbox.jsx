"use client";

// One global viewer shared by customer chat, admin chat, the floating widget,
// internal staff chat and the shared-content panel. Images never navigate away
// from the chat: they open here with zoom, pan and next/previous navigation.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";
import { clampZoom, isVideoType, nextMediaIndex } from "@/lib/chatMedia";

const MediaContext = createContext(null);

export function useChatMedia() {
  return useContext(MediaContext);
}

export default function ChatMediaProvider({ children }) {
  const [viewer, setViewer] = useState(null); // { items, index }
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);
  const dragRef = useRef(null);
  const viewerRef = useRef(viewer);
  useEffect(() => { viewerRef.current = viewer; }, [viewer]);

  const open = useCallback((items, index = 0) => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return;
    triggerRef.current = typeof document !== "undefined" ? document.activeElement : null;
    setViewer({ items: list, index: Math.min(Math.max(0, index), list.length - 1) });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const close = useCallback(() => {
    setViewer(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    requestAnimationFrame(() => triggerRef.current?.focus?.());
  }, []);

  const step = useCallback((delta) => {
    const current = viewerRef.current;
    if (!current || current.items.length < 2) return;
    setViewer({ ...current, index: nextMediaIndex(current.items.length, current.index, delta) });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const changeZoom = useCallback((delta) => {
    setZoom((current) => {
      const next = clampZoom(current + delta);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const isOpen = Boolean(viewer);
  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
      else if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(0.25); }
      else if (event.key === "-") { event.preventDefault(); changeZoom(-0.25); }
      else if (event.key === "0") { event.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }); }
      // Keep focus inside the dialog while it is open.
      else if (event.key === "Tab" && viewerRef.current) {
        const container = document.querySelector("[data-chat-media-viewer]");
        const focusable = container?.querySelectorAll("button, a[href], video[controls]");
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, close, step, changeZoom]);

  const item = viewer?.items?.[viewer.index] || null;
  const count = viewer?.items?.length || 0;
  const contextValue = useMemo(() => ({ open }), [open]);

  const onPointerDown = (event) => {
    if (zoom <= 1 || isVideoType(item?.type)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, pan: { ...pan } };
    setDragging(true);
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({
      x: drag.pan.x + (event.clientX - drag.x),
      y: drag.pan.y + (event.clientY - drag.y),
    });
  };
  const endDrag = () => { dragRef.current = null; setDragging(false); };

  return (
    <MediaContext.Provider value={contextValue}>
      {children}
      {item && (
        <div
          data-chat-media-viewer
          role="dialog"
          aria-modal="true"
          aria-label={`Media viewer: ${item.name || "attachment"}`}
          className="fixed inset-0 z-[120] flex flex-col bg-slate-950/95 text-white backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.name || "Shared media"}</p>
              {count > 1 && <p className="text-xs text-slate-400">{viewer.index + 1} of {count}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => changeZoom(-0.25)} disabled={zoom <= 1} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400" aria-label="Zoom out"><ZoomOut size={19} /></button>
              <span className="w-12 text-center text-xs tabular-nums text-slate-300" aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => changeZoom(0.25)} disabled={zoom >= 5} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400" aria-label="Zoom in"><ZoomIn size={19} /></button>
              <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400" aria-label="Reset zoom"><RotateCcw size={18} /></button>
              <a href={item.url} target="_blank" rel="noreferrer" download={item.name} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400" aria-label="Download media"><Download size={18} /></a>
              <button ref={closeButtonRef} type="button" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400" aria-label="Close media viewer"><X size={22} /></button>
            </div>
          </header>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2"
            onWheel={(event) => {
              if (!isVideoType(item.type)) {
                event.preventDefault();
                changeZoom(event.deltaY < 0 ? 0.2 : -0.2);
              }
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
          >
            {isVideoType(item.type) ? (
              <video src={item.url} controls autoPlay={false} playsInline className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" aria-label={item.name || "Video"} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt={item.name || "Shared image"}
                className="max-h-full max-w-full select-none object-contain shadow-2xl"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: dragging ? "none" : "transform 120ms ease-out" }}
                draggable={false}
              />
            )}
            {count > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/70 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 sm:left-6" aria-label="Previous media"><ChevronLeft size={24} /></button>
                <button type="button" onClick={() => step(1)} className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/70 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 sm:right-6" aria-label="Next media"><ChevronRight size={24} /></button>
              </>
            )}
          </div>
          <footer className="shrink-0 px-4 py-2 text-center text-[11px] text-slate-500">
            Use arrow keys to browse · + / − to zoom · 0 to reset · Esc to close
          </footer>
        </div>
      )}
    </MediaContext.Provider>
  );
}
