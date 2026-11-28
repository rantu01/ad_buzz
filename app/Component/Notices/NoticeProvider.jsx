"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { authFetch } from "@/lib/authFetch";
import useSSE from "@/app/Component/Hooks/useSSE";
import NoticeModal from "./NoticeModal";

const EMPTY_COUNTS = { total: 0, unread: 0, pendingAck: 0, importantUnread: 0 };
const NoticeContext = createContext({
  counts: EMPTY_COUNTS,
  pendingCount: 0,
  refresh: async () => {},
  openNoticeById: async () => {},
});

export function useNotices() {
  return useContext(NoticeContext);
}

// Mounted once in the customer dashboard shell. All state comes from MongoDB
// via the token-authenticated APIs — never from localStorage. Notices are
// delivered by SSE when online and reconciled from the database on login,
// focus, reconnect and a gentle periodic fallback, so offline customers get
// their pending notices as soon as they return.
const POLL_MS = 60000;

export default function NoticeProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shownRef = useRef(new Set());
  const openingRef = useRef(false);
  const ackInFlightRef = useRef(false);
  const currentIdRef = useRef(null);
  const refreshTimer = useRef(null);

  useEffect(() => {
    currentIdRef.current = current?._id || null;
  }, [current]);

  const refresh = useCallback(async () => {
    if (!uid) return;
    try {
      const [countRes, noticeRes] = await Promise.all([
        authFetch("/api/notices/counts", {}, user),
        authFetch("/api/notices?needsAction=1&limit=20", {}, user),
      ]);
      const countData = await countRes.json().catch(() => ({}));
      const noticeData = await noticeRes.json().catch(() => ({}));
      if (countData.success) {
        setCounts({
          total: Number(countData.total) || 0,
          unread: Number(countData.unread) || 0,
          pendingAck: Number(countData.pendingAck) || 0,
          importantUnread: Number(countData.importantUnread) || 0,
        });
      }
      if (noticeData.success) {
        const pending = (noticeData.notices || []).filter(
          (n) => !shownRef.current.has(n._id) && n._id !== currentIdRef.current
        );
        setQueue(pending);
      }
    } catch {
      // Keep last known state; the next event/focus/poll refresh retries.
    }
  }, [uid, user]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => refresh(), 200);
  }, [refresh]);

  useEffect(() => {
    shownRef.current = new Set();
    currentIdRef.current = null;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setQueue([]);
      setCurrent(null);
      setCounts(EMPTY_COUNTS);
      refresh();
    });
    return () => { cancelled = true; };
  }, [uid, refresh]);

  useEffect(() => {
    const onFocus = () => scheduleRefresh();
    const onVisibility = () => { if (document.visibilityState === "visible") scheduleRefresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const poll = setInterval(() => refresh(), POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(poll);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [scheduleRefresh, refresh]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type === "notice:published" || type === "notice:updated") scheduleRefresh();
      if (type === "notify" && data?.notification?.refType === "notice") scheduleRefresh();
    },
    onReconnect: scheduleRefresh,
  });

  // Show one notice at a time. The API returns them sorted by priority then
  // publication time. Opening only writes readAt — acknowledgement is a
  // separate, explicit server request from the Confirm button.
  useEffect(() => {
    if (current || openingRef.current || queue.length === 0) return;
    const next = queue[0];
    openingRef.current = true;
    setQueue((prev) => prev.filter((n) => n._id !== next._id));
    setCurrent(next);
    setError("");
    authFetch(`/api/notices/${next._id}/read`, { method: "POST" }, user)
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data.recipient) {
          setCurrent((prev) => (prev && prev._id === next._id ? { ...prev, recipient: data.recipient } : prev));
        }
        if (typeof data?.unread === "number") setCounts((prev) => ({ ...prev, unread: data.unread }));
      })
      .catch(() => {})
      .finally(() => {
        openingRef.current = false;
      });
  }, [queue, current, user]);

  // Mandatory notices have no dismiss path. This is only reachable for
  // optional notices (and as a defensive guard).
  const closeNotice = useCallback(() => {
    if (current?.requireAcknowledgement) return;
    if (current?._id) shownRef.current.add(current._id);
    setCurrent(null);
    setError("");
    scheduleRefresh();
  }, [current, scheduleRefresh]);

  const acknowledgeCurrent = useCallback(async () => {
    if (!current?._id || ackInFlightRef.current) return;
    ackInFlightRef.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await authFetch(`/api/notices/${current._id}/acknowledge`, { method: "POST" }, user);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const message = data?.message || "Could not save your confirmation. Please try again.";
        setError(message);
        Swal.fire({ toast: true, position: "top-end", icon: "error", title: message, timer: 3000, showConfirmButton: false });
        return; // keep the modal open — never close on a failed acknowledgement
      }
      Swal.fire({
        toast: true, position: "top-end", icon: "success",
        title: "Notice confirmed", timer: 2000, showConfirmButton: false,
      });
      shownRef.current.add(current._id);
      setCurrent(null);
      setCounts((prev) => ({
        ...prev,
        unread: typeof data.unread === "number" ? data.unread : prev.unread,
        pendingAck: typeof data.pendingAck === "number" ? data.pendingAck : Math.max(0, prev.pendingAck - 1),
      }));
      scheduleRefresh();
    } catch {
      const message = "Network error. Your confirmation was not saved — please try again.";
      setError(message);
      Swal.fire({ toast: true, position: "top-end", icon: "error", title: message, timer: 3000, showConfirmButton: false });
    } finally {
      ackInFlightRef.current = false;
      setBusy(false);
    }
  }, [current, user, scheduleRefresh]);

  const openNoticeById = useCallback(
    async (id) => {
      if (!id) return false;
      try {
        const res = await authFetch(`/api/notices/${id}`, {}, user);
        const data = await res.json().catch(() => ({}));
        if (data.success && data.notice) {
          setCurrent(data.notice);
          setError("");
          scheduleRefresh();
          return true;
        }
        return false;
      } catch {
        // Keep whatever is already on screen; the next refresh reconciles.
        return false;
      }
    },
    [user, scheduleRefresh]
  );

  const value = useMemo(
    () => ({ counts, pendingCount: counts.pendingAck, refresh, openNoticeById }),
    [counts, refresh, openNoticeById]
  );

  const mustAcknowledge = Boolean(current?.requireAcknowledgement) && !current?.recipient?.acknowledgedAt;

  return (
    <NoticeContext.Provider value={value}>
      {children}
      <NoticeModal
        notice={current}
        onClose={closeNotice}
        onAcknowledge={mustAcknowledge ? acknowledgeCurrent : null}
        busy={busy}
        error={error}
        mandatory={mustAcknowledge}
      />
    </NoticeContext.Provider>
  );
}
