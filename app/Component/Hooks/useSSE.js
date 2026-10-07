"use client";

import { useEffect, useRef } from "react";

const GRANULAR_EVENTS = [
  "balance",
  "sync",
  "meta",
  "ad-account",
  "ad_account.created",
  "ad_account.updated",
  "ad_account.deleted",
  "meta-status",
  "ticket.created",
  "ticket.updated",
  "deposit.created",
  "deposit.updated",
];

export default function useSSE({ uid, channels = [], onEvent } = {}) {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!uid) return;

    const params = new URLSearchParams({ uid });
    if (channels.length > 0) {
      for (const c of channels) params.append("channel", c);
    }

    let es = null;
    let closed = false;
    let retryMs = 3000;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`/api/events?${params.toString()}`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onEventRef.current?.("message", data);
        } catch {}
      };

      for (const type of GRANULAR_EVENTS) {
        es.addEventListener(type, (event) => {
          try {
            const data = JSON.parse(event.data);
            retryMs = 3000; // successful event resets backoff
            onEventRef.current?.(type, data);
          } catch {}
        });
      }

      es.onerror = () => {
        // EventSource auto-retries, but if the stream dies hard, reconnect
        // with backoff so network interruptions recover.
        try { es?.close(); } catch {}
        if (closed) return;
        const delay = Math.min(retryMs, 30000);
        retryMs = Math.min(retryMs * 2, 30000);
        setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      try { es?.close(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, channels.join(",")]);

  return null;
}
