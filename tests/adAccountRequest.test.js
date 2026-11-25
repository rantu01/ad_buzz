import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateRequestPayload,
  validateAdminAction,
  validateCustomerInfo,
  normalizeWebsiteLink,
  statusLabel,
  REQUEST_STATUSES,
} from "../lib/adAccountRequestConstants.js";

const valid = {
  platform: "Meta",
  adAccountName: "Summer Campaign",
  monthlyBudget: "1250.50",
  product: "Headphones",
  businessManagerId: "bm-123456",
  websitePageLink: "https://example.com/shop",
};

describe("validateRequestPayload", () => {
  it("accepts a complete valid request and normalizes the budget", () => {
    const result = validateRequestPayload(valid);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, {});
    assert.equal(result.value.monthlyBudget, 1250.5);
    assert.equal(result.value.businessManagerId, "bm-123456");
    assert.equal(result.value.websitePageLink, "https://example.com/shop");
  });

  it("reports every missing mandatory field", () => {
    const result = validateRequestPayload({});
    assert.equal(result.ok, false);
    for (const field of ["platform", "adAccountName", "monthlyBudget", "product", "businessManagerId", "websitePageLink"]) {
      assert.ok(result.errors[field], `expected an error for ${field}`);
    }
  });

  it("rejects zero, negative, non-numeric and over-precise budgets", () => {
    for (const budget of [0, -1, "abc", "1.234", "", null]) {
      const result = validateRequestPayload({ ...valid, monthlyBudget: budget });
      assert.equal(result.ok, false, `expected ${String(budget)} to be rejected`);
      assert.ok(result.errors.monthlyBudget);
    }
  });

  it("accepts a bare social page link by prefixing https", () => {
    const result = validateRequestPayload({ ...valid, websitePageLink: "facebook.com/my-page" });
    assert.equal(result.ok, true);
    assert.equal(result.value.websitePageLink, "https://facebook.com/my-page");
  });

  it("rejects non-web protocols and invalid URLs", () => {
    for (const link of ["javascript:alert(1)", "not a url", "ftp://example.com", ""]) {
      assert.equal(normalizeWebsiteLink(link), null, `expected ${link} to be rejected`);
    }
  });

  it("keeps the Business Manager ID exactly as entered", () => {
    const id = "  BM-007-X  ";
    const result = validateRequestPayload({ ...valid, businessManagerId: id });
    assert.equal(result.ok, true);
    assert.equal(result.value.businessManagerId, id);
  });
});

describe("validateAdminAction", () => {
  it("approves without extra input", () => {
    const result = validateAdminAction({ action: "approve" });
    assert.equal(result.ok, true);
    assert.equal(result.value.status, "approved");
  });

  it("requires a reason for rejection through either action", () => {
    assert.equal(validateAdminAction({ action: "reject" }).ok, false);
    assert.equal(validateAdminAction({ action: "reject", reason: "  " }).ok, false);
    const withReason = validateAdminAction({ action: "reject", reason: "Budget out of policy" });
    assert.equal(withReason.ok, true);
    assert.equal(withReason.value.reason, "Budget out of policy");
    assert.equal(validateAdminAction({ action: "status", status: "rejected" }).ok, false);
  });

  it("requires a message when asking for more information", () => {
    assert.equal(validateAdminAction({ action: "more_info" }).ok, false);
    const result = validateAdminAction({ action: "more_info", note: "Please share the BM screenshot." });
    assert.equal(result.ok, true);
    assert.equal(result.value.status, "more_info_required");
    assert.equal(result.value.note, "Please share the BM screenshot.");
  });

  it("only allows known statuses and actions", () => {
    assert.equal(validateAdminAction({ action: "status", status: "unknown" }).ok, false);
    assert.equal(validateAdminAction({ action: "delete" }).ok, false);
    assert.equal(validateAdminAction({ action: "status", status: "under_review" }).ok, true);
  });
});

describe("statuses and customer replies", () => {
  it("exposes all five statuses with human labels", () => {
    assert.deepEqual(REQUEST_STATUSES, ["pending", "under_review", "approved", "rejected", "more_info_required"]);
    assert.equal(statusLabel("more_info_required"), "More Information Required");
  });

  it("requires a non-empty customer information message", () => {
    assert.equal(validateCustomerInfo({ message: "" }).ok, false);
    assert.equal(validateCustomerInfo({ message: "Here is the document" }).ok, true);
  });
});
