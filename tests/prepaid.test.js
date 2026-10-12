import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePrepaidBalance } from "../lib/prepaid.js";

describe("parsePrepaidBalance", () => {
  it("returns unavailable for null/undefined input (never fake $0)", () => {
    assert.deepEqual(parsePrepaidBalance(null), { value: null, status: "unavailable", raw: null });
    assert.deepEqual(parsePrepaidBalance(undefined), { value: null, status: "unavailable", raw: null });
  });

  it("parses integer minor units (cents) to dollars", () => {
    const r = parsePrepaidBalance({ balance: 7025 });
    assert.equal(r.status, "available");
    assert.equal(r.value, 70.25);
  });

  it("parses the live v22 display_string funds shape (type 20)", () => {
    const r = parsePrepaidBalance({ id: "x", display_string: "Available balance ($1.92 USD)", type: 20 });
    assert.equal(r.status, "available");
    assert.equal(r.value, 1.92);
  });

  it("never parses a card display string as money (VISA *4226 guard)", () => {
    const r = parsePrepaidBalance({ display_string: "VISA *4226", type: 1 });
    assert.equal(r.status, "unavailable");
    assert.equal(r.value, null);
  });

  it("finds available funds inside arrays and nested funding_source", () => {
    const arr = parsePrepaidBalance([
      { display_string: "VISA *4226", type: 1 },
      { display_string: "Available balance ($5.00 USD)", type: 20 },
    ]);
    assert.equal(arr.value, 5);
    const nested = parsePrepaidBalance({ funding_source: { stored_balance: 1000 } });
    assert.equal(nested.value, 10);
  });

  it("treats decimal strings as major units, integer strings as minor units", () => {
    assert.equal(parsePrepaidBalance({ balance: "70.25" }).value, 70.25);
    assert.equal(parsePrepaidBalance({ balance: "7025" }).value, 70.25);
  });
});
