import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRemainingBalance, remainingBalanceSource } from "../lib/accountMath.js";

describe("computeRemainingBalance", () => {
  it("subtracts amount spent from spend cap", () => {
    assert.equal(computeRemainingBalance(209.25, 148.33), 209.25 - 148.33);
  });

  it("returns 0 when fully spent (never confuses zero with missing)", () => {
    assert.equal(computeRemainingBalance(100, 100), 0);
  });

  it("returns null for missing/invalid inputs (rendered as N/A, never $0)", () => {
    assert.equal(computeRemainingBalance(null, 10), null);
    assert.equal(computeRemainingBalance(100, undefined), null);
    assert.equal(computeRemainingBalance("100", 10), null);
    assert.equal(computeRemainingBalance(NaN, 10), null);
    assert.equal(computeRemainingBalance(100, NaN), null);
    assert.equal(computeRemainingBalance(Infinity, 10), null);
  });
});

describe("remainingBalanceSource", () => {
  it("marks numbers as meta, null/undefined as unavailable", () => {
    assert.equal(remainingBalanceSource(12.5), "meta");
    assert.equal(remainingBalanceSource(0), "meta");
    assert.equal(remainingBalanceSource(null), "unavailable");
    assert.equal(remainingBalanceSource(undefined), "unavailable");
  });
});
