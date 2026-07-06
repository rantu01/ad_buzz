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

    sync();
    intervalRef.current = setInterval(sync, INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}
