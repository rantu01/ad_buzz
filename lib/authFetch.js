// Client-side fetch wrapper for the Ad Account Request APIs. Attaches the
// current Firebase ID token so the server can derive identity from the
// verified token instead of trusting a client-supplied uid or role.
export async function authFetch(url, options = {}, user = null) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  if (user && typeof user.getIdToken === "function") {
    try {
      const token = await user.getIdToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch {
      // The request will be rejected with a clear 401 by the server.
    }
  }
  return fetch(url, { ...options, headers, cache: options.cache || "no-store" });
}

export async function authJson(url, options = {}, user = null) {
  const res = await authFetch(url, options, user);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
