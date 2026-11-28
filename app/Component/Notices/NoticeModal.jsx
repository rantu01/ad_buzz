"use client";

import { useEffect, useRef } from "react";
import { Building2, Loader2, X } from "lucide-react";
import NoticeContent from "./NoticeContent";
import { COMPANY_NAME, formatNoticeDate } from "@/lib/noticeConstants";

// Customer-facing notice modal. Mandatory notices have NO dismiss path: no
// outside click, no Escape, no close icon. They stay open until the explicit
// acknowledgement request succeeds. Optional notices can be closed normally.
export default function NoticeModal({ notice, onClose, onAcknowledge, busy = false, error = "", mandatory = false }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const ackRef = useRef(null);
  const restoreRef = useRef(null);
  const handlers = useRef({ onClose, onAcknowledge, mandatory });

  useEffect(() => {
    handlers.current = { onClose, onAcknowledge, mandatory };
  }, [onClose, onAcknowledge, mandatory]);

  const open = Boolean(notice);
  const id = notice?._id || null;

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = setTimeout(() => {
      if (handlers.current.mandatory) ackRef.current?.focus();
      else closeRef.current?.focus();
    }, 0);

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        // Escape must never bypass a required acknowledgement.
        if (handlers.current.mandatory) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        handlers.current.onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture phase so the modal wins over any dashboard-level key handlers.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, id]);

  if (!notice) return null;

  const acknowledged = Boolean(notice.recipient?.acknowledgedAt);
  const footerNote = acknowledged
    ? "You have acknowledged this notice."
    : mandatory
      ? "Please confirm that you have read this notice to continue."
      : "You have read this notice.";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (mandatory) return;
        if (event.target === event.currentTarget) handlers.current.onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-modal-title"
        className="notice-modal-panel flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="notice-modal-title" className="text-sm font-bold leading-snug text-slate-900 sm:text-base">
              {notice.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
              <Building2 size={12} aria-hidden="true" />
              <span className="font-semibold text-slate-700">{notice.company || COMPANY_NAME}</span>
              <span aria-hidden="true">·</span>
              <span>{formatNoticeDate(notice.publishedAt)}</span>
            </div>
          </div>
          {!mandatory ? (
            <button
              ref={closeRef}
              type="button"
              onClick={() => handlers.current.onClose?.()}
              aria-label="Close notice"
              className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-secondary/40"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" tabIndex={0} aria-label="Notice content">
          <NoticeContent notice={notice} />
        </div>

        <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">{footerNote}</p>
            {mandatory ? (
              <button
                ref={ackRef}
                type="button"
                disabled={busy}
                onClick={() => handlers.current.onAcknowledge?.()}
                className="rounded-lg bg-[#EA580C] px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#C2410C] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                {busy ? "Confirming…" : "Confirm & Acknowledge"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handlers.current.onClose?.()}
                className="rounded-lg bg-[#EA580C] px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#C2410C]"
              >
                Close
              </button>
            )}
          </div>
          {error ? (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
