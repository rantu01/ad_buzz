// Browser (desktop) notifications for chat and calls.
//
// Honest scope: these work while the page is open, including when the tab is
// in the background. True delivery after the browser is closed requires Web
// Push (service worker + VAPID); this project has neither, so we do not
// pretend SSE can deliver there. Permission is requested once, after a user
// gesture, and an explicit "off" preference is always respected.

const PREF_KEY = "ab_browser_notifications";
const ASKED_KEY = "ab_browser_notifications_asked";
const seen = new Set();
const SEEN_MAX = 300;

export function getNotificationPreference() {
  try {
    return window.localStorage.getItem(PREF_KEY) || "unset";
  } catch {
    return "unset";
  }
}

export function setNotificationPreference(value) {
  try {
    window.localStorage.setItem(PREF_KEY, value === "off" ? "off" : "on");
  } catch {}
}

// Called from a user-gesture handler. Never prompts twice, never prompts
// after the user has opted out.
export function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    if (window.localStorage.getItem(PREF_KEY) === "off") return;
    if (window.localStorage.getItem(ASKED_KEY) === "1") return;
    if (Notification.permission !== "default") return;
    window.localStorage.setItem(ASKED_KEY, "1");
    Notification.requestPermission().catch(() => {});
  } catch {}
}

function canShow(id) {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  if (getNotificationPreference() === "off") return false;
  if (!document.hidden) return false; // in-app toast covers the foreground case
  if (!id) return false;
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value);
  return true;
}

export function showBrowserNotification({ id, title, body, tag }) {
  if (!canShow(id)) return;
  try {
    const notification = new Notification(String(title || "Ad Buzz"), {
      body: String(body || "").slice(0, 160),
      tag: tag || id,
      icon: "/favicon.png",
      silent: false,
    });
    notification.onclick = () => {
      try { window.focus(); } catch {}
      notification.close();
    };
  } catch {}
}
