"use client";

import { ArrowRight, CalendarDays } from "lucide-react";
import { CHANGE_KIND_LABELS, COMPANY_NAME, formatNoticeDate } from "@/lib/noticeConstants";

// Shared renderer for the notice body: sanitized rich text, optional effective
// date banner, structured change list and the Ads Buzz signature. Used by the
// customer modal, the Notice Center cards and the admin preview.
export function StructuredChanges({ notice, compact = false }) {
  const changes = Array.isArray(notice?.structuredChanges) ? notice.structuredChanges : [];
  if (changes.length === 0) return null;
  const kind = notice.changeKind || "general";

  return (
    <div className={compact ? "mt-3" : "mt-5"}>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {CHANGE_KIND_LABELS[kind] || CHANGE_KIND_LABELS.general}
      </h4>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {changes.map((item, index) => (
          <div
            key={`${item.accountName}-${index}`}
            className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 ${
              index < changes.length - 1 ? "border-b border-slate-100" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="break-words text-xs font-semibold text-slate-800">{item.accountName}</p>
              {item.identifier ? (
                <p className="break-all text-[11px] text-slate-500">{item.identifier}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
              <span className="text-slate-400 line-through">{item.previousRate || "—"}</span>
              <ArrowRight size={13} className="text-slate-400" aria-hidden="true" />
              <span className="text-emerald-600">{item.newRate || "—"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NoticeContent({ notice, compact = false, showSignature = true }) {
  if (!notice) return null;
  return (
    <div className={compact ? "" : "px-5 py-4"}>
      {notice.effectiveAt ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#FFF4DC] px-3 py-2 text-[11px] font-semibold text-[#8A5A0A]">
          <CalendarDays size={14} aria-hidden="true" />
          <span>Takes effect on {formatNoticeDate(notice.effectiveAt, true)}</span>
        </div>
      ) : null}

      <div className="notice-rich" dangerouslySetInnerHTML={{ __html: notice.message || "" }} />

      <StructuredChanges notice={notice} compact={compact} />

      {showSignature ? (
        <p className="mt-5 text-xs font-bold text-slate-700">{notice.company || COMPANY_NAME}</p>
      ) : null}
    </div>
  );
}
