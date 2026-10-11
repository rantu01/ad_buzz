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
const connections = new Map();

function getConnectionKey(uid, channels) {
  return `${uid}\n${[...channels].sort().join(",")}`;
}

function createConnection(uid, channels) {
  const listeners = new Set();
  const params = new URLSearchParams({ uid });
  for (const channel of channels) params.append("channel", channel);

  let eventSource = null;
  let closed = false;
  let reconnectTimer = null;
  let retryMs = SERVER_RETRY_MS;

  const notify = (type, event) => {
    try {
      const data = JSON.parse(event.data);
      if (type !== "message") retryMs = SERVER_RETRY_MS;
      for (const listener of listeners) listener(type, data);
    } catch {
      // Ignore malformed individual events without taking down the stream.
    }
  };

  const connect = () => {
    if (closed) return;
    eventSource = new EventSource(`/api/events?${params.toString()}`);
    eventSource.onmessage = (event) => notify("message", event);
    for (const type of GRANULAR_EVENTS) {
      eventSource.addEventListener(type, (event) => notify(type, event));
    }
    eventSource.onerror = () => {
      if (closed) return;
      eventSource?.close();
      eventSource = null;
      const jitter = Math.floor(Math.random() * Math.max(1000, retryMs * 0.25));
      const delay = Math.min(retryMs + jitter, 30000);
      retryMs = Math.min(retryMs * 2, 30000);
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  const connection = {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) connection.close();
      };
    },
    close() {
      if (closed) return;
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
      eventSource = null;
      connections.delete(getConnectionKey(uid, channels));
    },
  };

  return connection;
}

export default function useSSE({ uid, channels = [], onEvent } = {}) {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!uid) return;

    const normalizedChannels = [...new Set(channels)].sort();
    const key = getConnectionKey(uid, normalizedChannels);
    let connection = connections.get(key);
    if (!connection) {
      connection = createConnection(uid, normalizedChannels);
      connections.set(key, connection);
    }

    return connection.subscribe((type, data) => onEventRef.current?.(type, data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, channels.join(",")]);

  return null;
}
