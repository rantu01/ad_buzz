"use client";

import { useEffect, useRef } from "react";

const INTERVAL = 25 * 60 * 1000;

export default function SyncPoller() {
  const intervalRef = useRef(null);

  useEffect(() => {
    async function sync() {
      try {
        await fetch("/api/cron/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "full" }),
        });
      } catch {
      }
    }

    async function metaFetch() {
      try {
        await fetch("/api/cron/meta-fetch", { method: "POST" });
      } catch {
      }
    }

    sync();
    metaFetch();
    intervalRef.current = setInterval(() => {
      sync();
      metaFetch();
    }, INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}
