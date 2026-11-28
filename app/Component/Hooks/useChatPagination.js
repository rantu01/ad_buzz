"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_PAGE_SIZE, normalizePage } from "@/lib/chatPagination";

/**
 * Reusable cursor pagination for every chat thread in the app.
 *
 * `fetchPage({ before, limit })` must resolve to an API result containing
 * `messages` and, ideally, `hasMore` / `nextCursor`. Only the newest page is
 * loaded up front; `loadOlder()` walks backward one page at a time.
 *
 * State lives in refs where possible, so a scroll event never triggers a
 * second request while one is already in flight.
 */
export function useChatPagination({
  key,
  fetchPage,
  pageSize = CHAT_PAGE_SIZE,
  enabled = true,
} = {}) {
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const hasOlderRef = useRef(false);
  const cursorRef = useRef(null);
  const inFlightRef = useRef(false);
  const keyRef = useRef(key);
  const fetchPageRef = useRef(fetchPage);

  useEffect(() => { fetchPageRef.current = fetchPage; }, [fetchPage]);

  // A conversation switch starts a fresh window over the newest messages.
  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    cursorRef.current = null;
    hasOlderRef.current = false;
    inFlightRef.current = false;
    setHasOlder(false);
  }, [key]);

  const applyPage = useCallback((data) => {
    const page = normalizePage(data, pageSize);
    cursorRef.current = page.nextCursor;
    hasOlderRef.current = page.hasMore;
    setHasOlder(page.hasMore);
    return page.messages;
  }, [pageSize]);

  // Restore pagination state for a conversation restored from the client cache.
  const restorePage = useCallback(({ cursor = null, hasMore = false } = {}) => {
    cursorRef.current = cursor;
    hasOlderRef.current = Boolean(hasMore);
    setHasOlder(Boolean(hasMore));
  }, []);

  const loadInitial = useCallback(async (options = {}) => {
    if (!enabled) return null;
    cursorRef.current = null;
    setLoadingInitial(true);
    try {
      const data = await fetchPageRef.current({ before: null, limit: pageSize, ...options });
      return applyPage(data);
    } finally {
      setLoadingInitial(false);
    }
  }, [enabled, pageSize, applyPage]);

  const loadOlder = useCallback(async () => {
    if (!enabled || inFlightRef.current || !hasOlderRef.current || !cursorRef.current) return null;
    inFlightRef.current = true;
    setLoadingOlder(true);
    try {
      const data = await fetchPageRef.current({ before: cursorRef.current, limit: pageSize });
      const older = applyPage(data);
      if (!older.length) {
        hasOlderRef.current = false;
        setHasOlder(false);
      }
      return older;
    } finally {
      inFlightRef.current = false;
      setLoadingOlder(false);
    }
  }, [enabled, pageSize, applyPage]);

  const getState = useCallback(() => ({ cursor: cursorRef.current, hasOlder: hasOlderRef.current }), []);

  return {
    hasOlder,
    loadingOlder,
    loadingInitial,
    loadInitial,
    loadOlder,
    applyPage,
    restorePage,
    getState,
  };
}

export default useChatPagination;
