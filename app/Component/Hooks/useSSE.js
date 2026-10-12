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
  "notify",
];

const SERVER_RETRY_MS = 15000;
const MAX_BACKOFF_MS = 30000;

// One physical EventSource per uid per tab. Subscribers declare the channels
// they need; the connection carries the UNION of all active channel sets, so
// N providers share 1 long-lived stream instead of N.
//
// Why this matters: browsers cap persistent connections per origin (6 on
// HTTP/1.1). The old per-channel pooling held 3 permanent SSE streams per
// admin tab (admin:tickets, admin:deposits, default). Two tabs — or one tab
// plus a long-held Meta API request (Sync Spend / Fetch-from-BM can run for
// minutes) — exhaust the pool, and every subsequent fetch() queues forever,
// including the RSC fetches behind Next.js <Link> navigation. The symptom is
// a "completely stuck" page whose sidebar clicks appear dead. Multiplexing
// to a single stream frees those slots regardless of HTTP version.
const connections = new Map(); // uid -> connection

function unionChannels(listeners) {
  const union = new Set();
  for (const l of listeners) for (const c of l.channels) union.add(c);
  return union;
}

function createConnection(uid) {
  const conn = {
    uid,
    listeners: new Set(),
    eventSource: null,
    closed: false,
    reconnectTimer: null,
    retryMs: SERVER_RETRY_MS,

    connect() {
      if (conn.closed) return;
      conn.disconnectSource();
      const params = new URLSearchParams({ uid });
      for (const channel of unionChannels(conn.listeners)) params.append("channel", channel);
      const es = new EventSource(`/api/events?${params.toString()}`);
      conn.eventSource = es;
      es.onmessage = (event) => conn.notify("message", event);
      for (const type of GRANULAR_EVENTS) {
        es.addEventListener(type, (event) => conn.notify(type, event));
      }
      es.onerror = () => {
        if (conn.closed) return;
        conn.disconnectSource();
        const jitter = Math.floor(Math.random() * Math.max(1000, conn.retryMs * 0.25));
        const delay = Math.min(conn.retryMs + jitter, MAX_BACKOFF_MS);
        conn.retryMs = Math.min(conn.retryMs * 2, MAX_BACKOFF_MS);
        conn.reconnectTimer = setTimeout(() => conn.connect(), delay);
      };
    },

    notify(type, event) {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        // Ignore malformed individual events without taking down the stream.
        return;
      }
      if (type !== "message") conn.retryMs = SERVER_RETRY_MS;
      // One bad listener must never break delivery to the others.
      for (const listener of [...conn.listeners]) {
        try {
          listener.fn(type, data);
        } catch {
          // ignore
        }
      }
    },

    disconnectSource() {
      try {
        conn.eventSource?.close();
      } catch {
        // ignore
      }
      conn.eventSource = null;
    },

    subscribe(channels, fn) {
      const listener = { channels: new Set(channels), fn };
      const before = unionChannels(conn.listeners);
      conn.listeners.add(listener);
      if (conn.listeners.size === 1) {
        conn.connect();
      } else {
        // A newly requested channel needs a server-side subscription, which
        // is fixed at connect time — reconnect once to grow the union. This
        // happens at most when providers mount (page navigations reuse the
        // stable union); every consumer reconciles from the server on mount,
        // so the sub-second reconnect window cannot leave stale state.
        const after = unionChannels(conn.listeners);
        for (const c of after) {
          if (!before.has(c)) {
            conn.connect();
            break;
          }
        }
      }
      return () => {
        conn.listeners.delete(listener);
        if (conn.listeners.size === 0) conn.close();
        // The union intentionally never shrinks while listeners remain:
        // reconnecting to unsubscribe could drop events in flight. The extra
        // channel traffic is tiny and every listener filters by event type.
      };
    },

    close() {
      if (conn.closed) return;
      conn.closed = true;
      if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
      conn.disconnectSource();
      if (connections.get(uid) === conn) connections.delete(uid);
    },
  };
  return conn;
}

export default function useSSE({ uid, channels = [], onEvent } = {}) {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  const channelsKey = [...new Set(channels)].sort().join(",");

  useEffect(() => {
    if (!uid) return;

    const channelList = channelsKey ? channelsKey.split(",") : [];
    let connection = connections.get(uid);
    if (!connection || connection.closed) {
      connection = createConnection(uid);
      connections.set(uid, connection);
    }

    return connection.subscribe(channelList, (type, data) => onEventRef.current?.(type, data));
  }, [uid, channelsKey]);

  return null;
}
