// Bounded HTTP helper for Meta Graph API calls (dependency-free).
//
// Every Meta fetch MUST go through fetchWithTimeout: a hung socket with no
// timeout wedges the reconcile pass forever, and the next scheduled pass
// only starts after the current one completes — so one hung request freezes
// "Last Refreshed" indefinitely. A timeout surfaces as a normal transient
// error, which the existing retry/backoff paths already handle.

export function getMetaFetchTimeoutMs() {
  const raw = Number(process.env.META_FETCH_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return Math.min(Math.floor(raw), 300000);
  return 30000;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = getMetaFetchTimeoutMs()) {
  const { signal: callerSignal, ...rest } = options || {};
  const ctrl = new AbortController();
  const onCallerAbort = () => ctrl.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) {
      ctrl.abort(callerSignal.reason);
    } else if (typeof callerSignal.addEventListener === "function") {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }
  const timer = setTimeout(
    () => ctrl.abort(new Error(`Meta fetch timed out after ${timeoutMs}ms: ${String(url).split("?")[0]}`)),
    timeoutMs
  );
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    if (callerSignal?.removeEventListener) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}
