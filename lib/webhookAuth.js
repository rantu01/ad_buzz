import { createHmac, timingSafeEqual } from "crypto";

// Meta webhook request verification (shared by the webhook route and tests).
// Signature header: `X-Hub-Signature-256: sha256=<hex hmac of raw body>`.

export function verifyWebhookSignature(rawBody, signatureHeader, appSecret) {
  // Secret not configured (setup phase): accept but let the caller log.
  if (!appSecret) return true;
  if (!signatureHeader) return false;
  const sig = String(signatureHeader).replace(/^sha256=/, "");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isValidVerifyChallenge({ mode, token, challenge }, verifyToken) {
  if (mode !== "subscribe" || !challenge) return false;
  // Empty server token (setup phase) accepts any challenge, matching prior
  // behavior; once META_WEBHOOK_VERIFY_TOKEN is set the token must match.
  if (!verifyToken) return true;
  return token === verifyToken;
}
