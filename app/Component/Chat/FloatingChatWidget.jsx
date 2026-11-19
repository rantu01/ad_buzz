"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import UserChatInterface from "./UserChatInterface";
import useSSE from "@/app/Component/Hooks/useSSE";

export default function FloatingChatWidget() {
  const { user } = useAuth();
  const pathname = usePathname();
  const uid = user?.uid;
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const triggerRef = useRef(null);

  const hidden = pathname?.replace(/\/+$/, "") === "/user-dashboard/chat";

  useEffect(() => {
    if (!uid || hidden) return;
    const load = () => fetch(`/api/user/chat/unread?uid=${encodeURIComponent(uid)}`).then((r) => r.json()).then((d) => { if (d.success) setUnread(d.unread || 0); }).catch(() => {});
    load();
  }, [uid, hidden]);
  useSSE({
    uid: hidden ? null : uid,
    channels: [],
    onEvent: (type) => {
      if (type !== "chat:message" && type !== "chat:read") return;
      fetch(`/api/user/chat/unread?uid=${encodeURIComponent(uid)}`).then((r) => r.json()).then((d) => { if (d.success) setUnread(d.unread || 0); }).catch(() => {});
    },
  });

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!uid || hidden) return null;

  return (
    <>
      {!open && (
        <button
          ref={triggerRef}
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition hover:scale-105 hover:bg-orange-600"
          aria-label="Open chat"
        >
          <MessageCircle size={24} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Chat"
          className="fixed bottom-4 right-4 z-50 h-[min(520px,calc(100dvh-2rem))] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="relative h-full">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-3 z-20 rounded-full bg-white/90 p-2 text-slate-600 shadow-sm hover:bg-slate-100" aria-label="Close chat">
              <X size={18} />
            </button>
            <div className="h-full">
              <UserChatInterface compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
