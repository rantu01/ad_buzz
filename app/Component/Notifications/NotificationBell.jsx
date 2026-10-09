"use client";

import { useState } from "react";
import { Bell, CheckCheck, Volume2, VolumeX } from "lucide-react";

// Shared notification bell + dropdown used identically by the admin and
// customer topbars. Unread rows render highlighted with a dot; read rows
// render muted. All behavior is prop-driven so both panels share one UI.
export default function NotificationBell({
  unread = 0,
  items = [],
  title = "Notifications",
  subtitle = "Latest updates",
  emptyText = "No new notifications.",
  viewAllLabel = "View all notifications",
  onSelect,
  onViewAll,
  onMarkAllRead,
  onOpen,
  soundOn = true,
  onToggleSound,
  accentClass = "bg-amber-100 text-amber-700",
  icon = null,
}) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && onOpen) onOpen();
  };

  const handleSelect = (item) => {
    setOpen(false);
    if (onSelect) onSelect(item);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E5DED6] bg-white text-slate-600 shadow-sm transition hover:border-secondary hover:text-primary-700"
        aria-label={title}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#E5DED6] bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <div className="flex items-center gap-1">
                  {onToggleSound && (
                    <button
                      type="button"
                      onClick={onToggleSound}
                      title={soundOn ? "Mute notification sound" : "Unmute notification sound"}
                      aria-label={soundOn ? "Mute notification sound" : "Unmute notification sound"}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    </button>
                  )}
                  {unread > 0 && onMarkAllRead && (
                    <button
                      type="button"
                      onClick={onMarkAllRead}
                      title="Mark all as read"
                      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                    >
                      <CheckCheck size={14} />
                      Mark all read
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">{emptyText}</p>
              ) : items.map((n) => {
                const isUnread = !n.read;
                return (
                  <button
                    key={String(n._id)}
                    type="button"
                    onClick={() => handleSelect(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${isUnread ? "bg-amber-50/60" : ""}`}
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${accentClass}`}>
                      {icon || <Bell size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${isUnread ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="block truncate text-xs text-slate-500">
                          {n.body}
                        </span>
                      )}
                      <span className="block text-[11px] text-slate-400">
                        {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                      </span>
                    </span>
                    {isUnread ? (
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" title="Unread" />
                    ) : (
                      <span className="mt-1 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Read
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {onViewAll && (
              <button
                type="button"
                onClick={() => { setOpen(false); onViewAll(); }}
                className="block w-full border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {viewAllLabel}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
