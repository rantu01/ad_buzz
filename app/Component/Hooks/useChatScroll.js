"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// The DOM work must happen before paint on the client, but useLayoutEffect
// warns during SSR (Next.js still server-renders client components).
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const DEFAULT_BOTTOM_THRESHOLD = 80;

/**
 * Shared scrolling behaviour for every chat thread in the app.
 *
 * - Opens / switches conversations at the newest message.
 * - Follows new messages only when the reader is already at the bottom.
 * - Keeps the viewport anchored when older messages are prepended (pagination).
 * - Exposes `atBottom` so each page can show a "Scroll to latest" button.
 * - Requests the next older page when the reader nears the top (reverse
 *   infinite scroll), once per in-flight request.
 *
 * Pass the scrollable element through `listRef` and attach `onScroll` to it.
 * For conditionally mounted lists, attach the returned `listRefCallback` so
 * resize observation starts when the list enters the DOM.
 */
export function useChatScroll({
  listRef,
  messages = [],
  conversationKey = null,
  loading = false,
  activityKey = null,
  threshold = DEFAULT_BOTTOM_THRESHOLD,
  onLoadOlder = null,
  hasOlder = false,
  loadingOlder = false,
  olderThreshold = 120,
} = {}) {
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [listRefVersion, setListRefVersion] = useState(0);
  const metricsRef = useRef({ scrollTop: 0, scrollHeight: 0 });
  const firstIdRef = useRef("");
  const countRef = useRef(0);
  const keyRef = useRef(conversationKey);
  const olderRef = useRef({ onLoadOlder, hasOlder, loadingOlder });
  // One older-page request per scroll position: a single user scroll can emit
  // several native scroll events, which must not fan out into duplicate calls.
  const loadAnchorRef = useRef(null);
  const bottomRef = useRef(null);

  const listRefCallback = useCallback((element) => {
    listRef.current = element;
    setListRefVersion((version) => version + 1);
  }, [listRef]);

  useEffect(() => {
    olderRef.current = { onLoadOlder, hasOlder, loadingOlder };
  }, [onLoadOlder, hasOlder, loadingOlder]);

  const captureMetrics = useCallback(() => {
    const el = listRef.current;
    if (el) metricsRef.current = { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight };
  }, [listRef]);

  const syncAtBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const next = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    atBottomRef.current = next;
    setAtBottom((prev) => (prev === next ? prev : next));
    captureMetrics();
  }, [listRef, threshold, captureMetrics]);

  const handleScroll = useCallback(() => {
    syncAtBottom();
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop > olderThreshold) {
      loadAnchorRef.current = null;
      return;
    }
    if (loadAnchorRef.current === el.scrollTop) return; // same request already issued
    const state = olderRef.current;
    if (state.hasOlder && !state.loadingOlder && typeof state.onLoadOlder === "function") {
      loadAnchorRef.current = el.scrollTop;
      state.onLoadOlder();
    }
  }, [syncAtBottom, listRef, olderThreshold]);

  const scrollToLatest = useCallback((behavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = true;
    setAtBottom(true);
    const sentinel = bottomRef.current;
    const target = sentinel
      ? el.scrollTop + sentinel.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom
      : el.scrollHeight;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: Math.max(0, target), behavior });
    else el.scrollTop = el.scrollHeight;
  }, [listRef]);

  // Call before pushing a message the user just sent: sending always brings
  // the composer's own message into view, even if they were reading history.
  const pinToBottom = useCallback(() => {
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  // A new conversation (or a page reload with a freshly resolved id) starts
  // pinned to the bottom. The next layout effect performs the actual jump.
  useIsomorphicLayoutEffect(() => {
    if (keyRef.current === conversationKey) return;
    keyRef.current = conversationKey;
    atBottomRef.current = true;
    setAtBottom(true);
    firstIdRef.current = "";
    countRef.current = 0;
    metricsRef.current = { scrollTop: 0, scrollHeight: 0 };
    loadAnchorRef.current = null;
  }, [conversationKey]);

  const firstId = messages.length ? String(messages[0].clientId || messages[0].messageId || "") : "";

  useIsomorphicLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const count = messages.length;
    // Pagination prepends older messages. If the previous first message is
    // still in the list, this was a prepend: preserve the reader's viewport
    // by shifting scrollTop by the added height instead of jumping.
    const prepended =
      count > countRef.current &&
      Boolean(firstIdRef.current) &&
      firstId !== firstIdRef.current &&
      messages.some((m) => String(m.clientId || m.messageId || "") === firstIdRef.current);

    if (prepended) {
      const delta = el.scrollHeight - metricsRef.current.scrollHeight;
      if (delta > 0) el.scrollTop = metricsRef.current.scrollTop + delta;
    } else if (atBottomRef.current) {
      // Instant, not animated: data updates must never scroll through the
      // middle of the conversation or fight with the smooth button scroll.
      el.scrollTop = el.scrollHeight;
    }

    firstIdRef.current = firstId;
    countRef.current = count;
    loadAnchorRef.current = null;
    captureMetrics();
  }, [messages, firstId, loading, conversationKey, activityKey, captureMetrics]);

  useIsomorphicLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
    captureMetrics();
  }, [listRefVersion, listRef, captureMetrics]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const resizeObserver = new ResizeObserver(() => {
      if (atBottomRef.current) {
        el.scrollTop = el.scrollHeight;
        captureMetrics();
      } else {
        syncAtBottom();
      }
    });
    const observeChildren = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(el);
      for (const child of el.children) resizeObserver.observe(child);
    };
    observeChildren();
    const mutationObserver = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(observeChildren);
    mutationObserver?.observe(el, { childList: true });
    return () => {
      mutationObserver?.disconnect();
      resizeObserver.disconnect();
    };
  }, [listRefVersion, listRef, captureMetrics, syncAtBottom]);

  return {
    atBottom,
    showScrollToLatest: !atBottom,
    handleScroll,
    scrollToLatest,
    pinToBottom,
    bottomRef,
    listRefCallback,
  };
}

export default useChatScroll;
