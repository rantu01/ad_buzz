"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "adbuzz_device_session_id";

function getOrCreateSessionId() {
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function collectClientDevice() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  let deviceName = "Desktop";
  let deviceType = "desktop";
  if (/iPhone/.test(ua)) {
    deviceName = "iPhone";
    deviceType = "mobile";
  } else if (/iPad/.test(ua)) {
    deviceName = "iPad";
    deviceType = "mobile";
  } else if (/Android/.test(ua)) {
    deviceName = "Android";
    deviceType = "mobile";
  } else if (/Windows/.test(ua)) {
    deviceName = "Windows";
  } else if (/Mac OS X/.test(ua)) {
    deviceName = "Mac";
  } else if (/Linux/.test(ua)) {
    deviceName = "Linux";
  }
  if (/Mobi|Android|iPhone|iPad|iPod|Mobile/.test(ua) && deviceType !== "mobile") {
    deviceType = "mobile";
    if (deviceName === "Desktop") deviceName = "Mobile";
  }
  return { deviceName, deviceType };
}

/**
 * Registers the current browser as a login session (fire-and-forget).
 * The stable per-browser sessionId lives in localStorage and is used
 * for the "This device" badge (see getStoredSessionId).
 */
export function useLoginSession(uid, email) {
  const postedRef = useRef("");

  useEffect(() => {
    if (!uid) return;
    const id = getOrCreateSessionId();
    const dedupeKey = `${uid}:${id}`;
    if (postedRef.current === dedupeKey) return;
    postedRef.current = dedupeKey;

    const controller = new AbortController();
    fetch("/api/user/login-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid,
        email: email || "",
        sessionId: id,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        clientDevice: collectClientDevice(),
      }),
      signal: controller.signal,
    }).catch(() => {
      // Session logging is best-effort; never break the page on failure.
    });

    return () => controller.abort();
  }, [uid, email]);
}

export function getStoredSessionId() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}
