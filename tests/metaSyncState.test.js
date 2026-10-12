import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fingerprintMetaAccount,
  diffMetaAccount,
  parseUsageHeader,
  usagePct,
  backoffDelayMs,
  isRateLimitError,
  runWithReschedule,
} from "../lib/syncMath.js";

const base = {
  name: "ADS_Test_550",
  accountStatus: 1,
  currency: "USD",
  balance: 49,
  spendCap: 209.25,
  amountSpent: 148.33,
  disableReason: null,
  prepaidBalance: null,
  isPrepayAccount: null,
};

describe("fingerprintMetaAccount", () => {
  it("is stable for identical input", () => {
    assert.equal(fingerprintMetaAccount(base), fingerprintMetaAccount({ ...base }));
  });

  it("changes when a watched field changes", () => {
    assert.notEqual(
      fingerprintMetaAccount(base),
      fingerprintMetaAccount({ ...base, name: "ADS_Renamed_550" })
    );
    assert.notEqual(
      fingerprintMetaAccount(base),
      fingerprintMetaAccount({ ...base, spendCap: 300 })
    );
  });

  it("ignores unwatched fields", () => {
    assert.equal(
      fingerprintMetaAccount(base),
      fingerprintMetaAccount({ ...base, importedAt: new Date(), extra: 1 })
    );
  });
});

describe("diffMetaAccount", () => {
  it("returns empty diff for unchanged values", () => {
    assert.deepEqual(diffMetaAccount(base, { ...base }), {});
  });

  it("detects rename, status, currency, cap and spent changes", () => {
    const changes = diffMetaAccount(base, {
      ...base,
      name: "New Name",
      accountStatus: 2,
      spendCap: 500,
      amountSpent: 100,
    });
    assert.deepEqual(Object.keys(changes).sort(), ["accountStatus", "amountSpent", "name", "spendCap"]);
  });

  it("treats sub-cent float noise as unchanged", () => {
    assert.deepEqual(diffMetaAccount(base, { ...base, spendCap: 209.2500001 }), {});
  });

  it("does not treat an unreadable prepaid sync (null) as a change over known funds", () => {
    const old = { ...base, prepaidBalance: 70.25 };
    assert.deepEqual(diffMetaAccount(old, { ...old, prepaidBalance: null }), {});
  });

  it("detects a real prepaid balance change", () => {
    const old = { ...base, prepaidBalance: 70.25 };
    const changes = diffMetaAccount(old, { ...old, prepaidBalance: 60 });
    assert.equal(changes.prepaidBalance, 60);
  });
});

describe("scheduler recovery", () => {
  it("runWithReschedule always reschedules, even when the pass throws", async () => {
    let rescheduled = 0;
    await runWithReschedule(
      async () => { throw new Error("transient"); },
      () => { rescheduled++; }
    ).catch(() => {});
    assert.equal(rescheduled, 1, "reschedule must fire despite the throw");

    await runWithReschedule(async () => "ok", () => { rescheduled++; });
    assert.equal(rescheduled, 2, "reschedule must fire on success too");
  });
});

describe("rate-limit helpers", () => {
  it("parses usage headers and takes the max", () => {
    const usage = parseUsageHeader('{"call_count": 40, "total_cputime": 75, "total_time": 20}');
    assert.equal(usagePct(usage), 75);
    assert.equal(parseUsageHeader("not-json"), null);
    assert.equal(usagePct(null), 0);
  });

  it("backs off exponentially with a cap", () => {
    const d0 = backoffDelayMs(0);
    const d3 = backoffDelayMs(3);
    const d99 = backoffDelayMs(99);
    assert.ok(d0 >= 30000 && d0 < 40000, `d0=${d0}`);
    assert.ok(d3 > d0, `d3=${d3} should exceed d0=${d0}`);
    assert.ok(d99 <= 10 * 60 * 1000 + 5000, `d99=${d99}`);
  });

  it("detects rate-limit errors by code and message", () => {
    assert.equal(isRateLimitError({ code: 613 }), true);
    assert.equal(isRateLimitError({ code: 80004 }), true);
    assert.equal(isRateLimitError(new Error("Too many calls, rate limit hit")), true);
    assert.equal(isRateLimitError(new Error("Permissions error")), false);
    assert.equal(isRateLimitError(null), false);
  });
});
