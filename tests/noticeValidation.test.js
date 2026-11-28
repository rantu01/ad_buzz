import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMPANY_NAME,
  formatNoticeDate,
  priorityRank,
  sanitizeNoticeHtml,
  validateNoticeInput,
  validateSafePublishedUpdate,
} from "../lib/noticeConstants.js";

const validBase = {
  title: "Your ad account rate has changed",
  message: "<p>নতুন হার</p><ul><li>৳130 → ৳133</li></ul>",
  type: "Account Rate Change",
  audienceType: "all",
  status: "published",
};

describe("notice constants", () => {
  it("uses only the Ads Buzz brand", () => {
    assert.equal(COMPANY_NAME, "Ads Buzz");
  });

  it("ranks urgent above high above normal", () => {
    assert.ok(priorityRank("urgent") > priorityRank("high"));
    assert.ok(priorityRank("high") > priorityRank("normal"));
  });

  it("formats dates with and without time", () => {
    const value = "2026-11-26T00:00:00.000Z";
    assert.match(formatNoticeDate(value), /Nov 2026/);
    assert.match(formatNoticeDate(value, true), /,.*(AM|PM)/);
    assert.equal(formatNoticeDate("not-a-date"), "");
  });

  it("sanitizes scripts and hardens links", () => {
    const html = sanitizeNoticeHtml('<p onclick="bad()">Hi</p><script>alert(1)</script><a href="https://example.com">Link</a>');
    assert.ok(!html.includes("<script"));
    assert.ok(!html.includes("onclick"));
    assert.ok(html.includes('rel="noopener noreferrer"'));
  });
});

describe("validateNoticeInput", () => {
  it("accepts a valid published notice and normalizes fields", () => {
    const check = validateNoticeInput(validBase);
    assert.equal(check.ok, true);
    assert.equal(check.value.status, "published");
    assert.ok(check.value.publishedAt instanceof Date);
    assert.equal(check.value.audienceType, "all");
  });

  it("requires a title and a real message", () => {
    const check = validateNoticeInput({ ...validBase, title: "", message: "<p></p>" });
    assert.equal(check.ok, false);
    assert.ok(check.errors.title);
    assert.ok(check.errors.message);
  });

  it("rejects unknown notice types", () => {
    const check = validateNoticeInput({ ...validBase, type: "Not a real type" });
    assert.equal(check.ok, false);
    assert.ok(check.errors.type);
  });

  it("requires selected customers for individual notices", () => {
    const check = validateNoticeInput({ ...validBase, audienceType: "individual", targetCustomerIds: [] });
    assert.equal(check.ok, false);
    assert.ok(check.errors.targetCustomerIds);
  });

  it("requires a publish time for scheduled notices", () => {
    const check = validateNoticeInput({ ...validBase, status: "scheduled" });
    assert.equal(check.ok, false);
    assert.ok(check.errors.scheduledAt);
  });

  it("rejects an already-expired published notice", () => {
    const check = validateNoticeInput({
      ...validBase,
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    });
    assert.equal(check.ok, false);
    assert.ok(check.errors.expiresAt);
  });

  it("keeps structured changes with masked identifiers only", () => {
    const check = validateNoticeInput({
      ...validBase,
      changeKind: "rate",
      structuredChanges: [
        { accountName: "Sponbooster_09_Rep_01", identifier: "••9168", previousRate: "৳130", newRate: "৳133" },
      ],
    });
    assert.equal(check.ok, true);
    assert.equal(check.value.structuredChanges[0].identifier, "••9168");
    assert.equal(check.value.structuredChanges[0].rateUnit, "৳");
  });
});

describe("validateSafePublishedUpdate", () => {
  const current = { expiresAt: new Date("2026-11-30T00:00:00Z"), title: "Published title" };

  it("allows priority changes and expiry extensions", () => {
    const check = validateSafePublishedUpdate(
      { priority: "urgent", expiresAt: "2026-12-05T00:00:00Z" },
      current
    );
    assert.equal(check.ok, true);
    assert.equal(check.value.priority, "urgent");
  });

  it("never allows shortening expiry", () => {
    const check = validateSafePublishedUpdate({ expiresAt: "2026-11-29T00:00:00Z" }, current);
    assert.equal(check.ok, false);
    assert.ok(check.errors.expiresAt);
  });

  it("locks content that customers may already have acknowledged", () => {
    const check = validateSafePublishedUpdate({ title: "Silently changed" }, current);
    assert.equal(check.ok, false);
    assert.match(check.errors.locked, /revision/i);
  });
});
