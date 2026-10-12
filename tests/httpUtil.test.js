import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchWithTimeout, getMetaFetchTimeoutMs } from "../lib/httpUtil.js";

describe("getMetaFetchTimeoutMs", () => {
  const prev = process.env.META_FETCH_TIMEOUT_MS;
  afterEach(() => {
    if (prev === undefined) delete process.env.META_FETCH_TIMEOUT_MS;
    else process.env.META_FETCH_TIMEOUT_MS = prev;
  });

  it("defaults to 30s", () => {
    delete process.env.META_FETCH_TIMEOUT_MS;
    assert.equal(getMetaFetchTimeoutMs(), 30000);
  });

  it("honors the env override and clamps absurd values", () => {
    process.env.META_FETCH_TIMEOUT_MS = "5000";
    assert.equal(getMetaFetchTimeoutMs(), 5000);
    process.env.META_FETCH_TIMEOUT_MS = "99999999";
    assert.equal(getMetaFetchTimeoutMs(), 300000);
    process.env.META_FETCH_TIMEOUT_MS = "bogus";
    assert.equal(getMetaFetchTimeoutMs(), 30000);
  });
});

describe("fetchWithTimeout", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("aborts a hung request instead of wedging the sync loop forever", async () => {
    globalThis.fetch = (url, opts) =>
      new Promise((_, reject) => {
        opts?.signal?.addEventListener("abort", () => reject(opts.signal.reason));
      }); // hangs until aborted
    await assert.rejects(
      fetchWithTimeout("https://graph.facebook.com/v22.0/act_1", {}, 50),
      /timed out after 50ms/
    );
  });

  it("passes successful responses through with an abort signal attached", async () => {
    let seenSignal = null;
    globalThis.fetch = async (url, opts) => {
      seenSignal = opts?.signal;
      return { ok: true, url };
    };
    const res = await fetchWithTimeout("https://example.com/x", {}, 5000);
    assert.equal(res.ok, true);
    assert.ok(seenSignal, "signal must be attached");
  });

  it("a caller abort still aborts the request", async () => {
    const ctrl = new AbortController();
    globalThis.fetch = (url, opts) =>
      new Promise((_, reject) => {
        opts?.signal?.addEventListener("abort", () =>
          reject(opts.signal.reason ?? new Error("aborted"))
        );
      });
    const pending = fetchWithTimeout("https://example.com/y", { signal: ctrl.signal }, 5000);
    ctrl.abort(new Error("caller gave up"));
    await assert.rejects(pending, /caller gave up/);
  });
});
