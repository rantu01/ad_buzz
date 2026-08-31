"use client";

import { useEffect, useRef } from "react";

export default function useSSE({ uid, channels = [], onEvent } = {}) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!uid) return;

    const params = new URLSearchParams({ uid });
    if (channels.length > 0) {
      for (const c of channels) params.append("channel", c);
    }

    const es = new EventSource(`/api/events?${params.toString()}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEventRef.current?.("message", data);
      } catch {}
    };

    const handlers = {};
    const handle = (type) => {
      if (handlers[type]) return;
      handlers[type] = (event) => {
        try {
          const data = JSON.parse(event.data);
          onEventRef.current?.(type, data);
        } catch {}
      };
      es.addEventListener(type, handlers[type]);
    };

    handle("balance");
    handle("sync");
    handle("meta");
    handle("ad-account");

    return () => {
      es.close();
    };
  }, [uid, channels.join(",")]);

  return null;
}
