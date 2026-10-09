"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PREF_KEY = "ab_notif_sound";

// Root cause of silent customer notifications: browsers start an
// AudioContext in the "suspended" state until the user interacts with the
// page (autoplay policy). The old code created a throwaway context at
// notification-arrival time and closed it a second later — on a page with
// no prior interaction (e.g. a customer passively waiting on the tickets
// page) the oscillators played into a suspended context: silence.
//
// Fix: one shared context, unlocked by the first user gesture
// (pointer/key/touch), resumed before every chime, with arrivals that land
// while still locked queued and played on unlock.
let sharedCtx = null;
let pendingPlays = 0;

function getSharedCtx() {
  try {
    if (typeof window === "undefined") return null;
    if (sharedCtx) return sharedCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    sharedCtx = new Ctx();
    return sharedCtx;
  } catch {
    return null;
  }
}

function unlockAudio() {
  try {
    const ctx = getSharedCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().then(() => flushPending()).catch(() => {});
    } else {
      flushPending();
    }
  } catch { /* audio is enhancement-only */ }
}

function flushPending() {
  try {
    if (pendingPlays > 0) {
      pendingPlays = 0;
      chime();
    }
  } catch { /* ignore */ }
}

function chime() {
  const ctx = getSharedCtx();
  if (!ctx || ctx.state !== "running") return false;
  try {
    const now = ctx.currentTime;
    const notes = [
      { freq: 784, at: 0, dur: 0.12 },
      { freq: 988, at: 0.13, dur: 0.18 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.0001, now + n.at);
      gain.gain.exponentialRampToValueAtTime(0.25, now + n.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.at);
      osc.stop(now + n.at + n.dur + 0.05);
    }
    return true;
  } catch {
    return false;
  }
}

// Short two-tone chime via WebAudio (no asset file needed). Safe to call
// anywhere; no-ops on the server or when audio is unavailable. If the
// context is still locked by the autoplay policy, the chime is queued and
// plays on the next user interaction instead of being lost.
export function playNotificationChime() {
  try {
    if (typeof window === "undefined") return;
    const ctx = getSharedCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      // Remember exactly one pending chime; the unlock handler plays it.
      // (Deduped upstream per notification id, so this never stacks.)
      pendingPlays = 1;
      ctx.resume().then(() => flushPending()).catch(() => {});
      return;
    }
    chime();
  } catch {
    // Audio is enhancement-only; never break the notification flow.
  }
}

export function useNotificationSound() {
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const seenRef = useRef(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREF_KEY);
      const on = raw === null ? true : raw === "1";
      setSoundOn(on);
      soundOnRef.current = on;
    } catch { /* default stays on */ }
    // Unlock WebAudio on the first interaction so later chimes are audible
    // even if notifications arrive before any gesture.
    getSharedCtx();
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("touchend", unlockAudio, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchend", unlockAudio);
    };
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      soundOnRef.current = next;
      try { window.localStorage.setItem(PREF_KEY, next ? "1" : "0"); } catch {}
      // Audible confirmation when enabling, so users know sound works.
      if (next) {
        try { unlockAudio(); playNotificationChime(); } catch { /* ignore */ }
      }
      return next;
    });
  }, []);

  // Play once per notification id, only for genuinely new unread arrivals.
  // Polling refreshes never call this — only live SSE events do — so
  // already-received or already-read rows never chime twice.
  const playFor = useCallback((notification) => {
    const id = notification?._id ? String(notification._id) : null;
    if (!id || seenRef.current.has(id)) return;
    seenRef.current.add(id);
    if (notification?.read) return;
    if (!soundOnRef.current) return;
    playNotificationChime();
  }, []);

  return { soundOn, toggleSound, playFor };
}
