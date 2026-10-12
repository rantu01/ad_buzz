import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, isValidVerifyChallenge } from "../lib/webhookAuth.js";

const SECRET = "test-app-secret";
const BODY = JSON.stringify({ object: "ad_account", entry: [] });
const goodSig = "sha256=" + createHmac("sha256", SECRET).update(BODY).digest("hex");

describe("verifyWebhookSignature", () => {
  it("accepts a valid HMAC signature", () => {
    assert.equal(verifyWebhookSignature(BODY, goodSig, SECRET), true);
  });

  it("rejects tampered bodies and wrong secrets", () => {
    assert.equal(verifyWebhookSignature(BODY + "x", goodSig, SECRET), false);
    assert.equal(verifyWebhookSignature(BODY, goodSig, "wrong-secret"), false);
  });

  it("rejects missing signatures when a secret is configured", () => {
    assert.equal(verifyWebhookSignature(BODY, "", SECRET), false);
    assert.equal(verifyWebhookSignature(BODY, null, SECRET), false);
  });

  it("accepts anything when no secret is configured (setup phase)", () => {
    assert.equal(verifyWebhookSignature(BODY, "", ""), true);
  });
});

describe("isValidVerifyChallenge", () => {
  it("accepts matching tokens with a challenge", () => {
    assert.equal(
      isValidVerifyChallenge({ mode: "subscribe", token: "tok", challenge: "123" }, "tok"),
      true
    );
  });

  it("rejects bad tokens and non-subscribe modes", () => {
    assert.equal(
      isValidVerifyChallenge({ mode: "subscribe", token: "bad", challenge: "123" }, "tok"),
      false
    );
    assert.equal(
      isValidVerifyChallenge({ mode: "unsubscribe", token: "tok", challenge: "123" }, "tok"),
      false
    );
    assert.equal(
      isValidVerifyChallenge({ mode: "subscribe", token: "tok", challenge: "" }, "tok"),
      false
    );
  });
});
