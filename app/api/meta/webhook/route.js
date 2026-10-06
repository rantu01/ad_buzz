import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getMetaSettings } from "@/lib/metaSettingsModel";
import { isDuplicateWebhookEvent } from "@/lib/metaSyncState";
import { requestPrioritySync, runFullReconcile } from "@/lib/autoMetaFetch";

export const dynamic = "force-dynamic";

async function getVerifyToken() {
  return process.env.META_WEBHOOK_VERIFY_TOKEN || "";
}

async function getAppSecret() {
  if (process.env.META_APP_SECRET) return process.env.META_APP_SECRET;
  try {
    const settings = await getMetaSettings();
    return settings?.appSecret || "";
  } catch {
    return "";
  }
}

// GET — Meta webhook verification challenge.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = await getVerifyToken();
  if (mode === "subscribe" && challenge) {
    if (!verifyToken || token === verifyToken) {
      console.log("[meta-webhook] Verification challenge accepted.");
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    console.warn("[meta-webhook] Verification failed: bad verify token.");
    return NextResponse.json({ success: false, message: "Invalid verify token" }, { status: 403 });
  }
  return NextResponse.json({ success: false, message: "Invalid verification request" }, { status: 400 });
}

function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return true; // Secret not configured: accept but log (setup phase).
  if (!signatureHeader) return false;
  const sig = signatureHeader.replace(/^sha256=/, "");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// POST — receive Meta event notifications. Must return fast; all Graph API
// work happens asynchronously via the priority queue.
export async function POST(request) {
  const rawBody = await request.text();
  const appSecret = await getAppSecret();
  const signature = request.headers.get("x-hub-signature-256") || request.headers.get("x-hub-signature") || "";

  if (!(await verifySignatureSafe(rawBody, signature, appSecret))) {
    console.warn("[meta-webhook] Rejected: invalid signature.");
    return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  // Respond immediately; process in background (never block the webhook).
  queueMicrotask(() => void handleWebhookPayload(payload).catch((e) => console.error("[meta-webhook] Handler error:", e.message)));

  return NextResponse.json({ success: true });
}

async function verifySignatureSafe(rawBody, signature, appSecret) {
  try {
    return verifySignature(rawBody, signature, appSecret);
  } catch {
    return false;
  }
}

async function handleWebhookPayload(payload) {
  const object = payload?.object;
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  console.log(`[meta-webhook] Received object=${object} entries=${entries.length}.`);

  if (object !== "ad_account") {
    console.log(`[meta-webhook] Ignoring non-ad_account object: ${object}.`);
    return;
  }

  const accountIds = new Set();
  let fullReconcile = false;

  for (const entry of entries) {
    const entryId = entry?.id ? String(entry.id) : null;
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const field = change?.field || "unknown";
      const time = entry?.time || Math.floor(Date.now() / 1000);
      const dedupeKey = `${entryId || "?" }:${field}:${time}:${JSON.stringify(change?.value || {}).slice(0, 80)}`;
      if (await isDuplicateWebhookEvent(dedupeKey)) continue;

      // Supported ad_account webhook fields (Meta docs, current):
      // effective_status, subscriptions, creative_fatigue, ad_recommendations,
      // in_process_ad_objects, with_issues_ad_objects, product_set_issue.
      // None of these carry rename/spend_cap payloads — they are delivery
      // triggers, so we refresh the affected account via a targeted fetch.
      const value = change?.value || {};
      const candidates = [entryId, value.ad_account_id, value.account_id, value.id]
        .map((v) => (v != null ? String(v) : ""))
        .filter(Boolean);
      for (const c of candidates) {
        const normalized = c.startsWith("act_") ? c : `act_${c.replace(/^act_/, "")}`;
        if (/^act_\d+$/.test(normalized)) accountIds.add(normalized);
      }
      console.log(`[meta-webhook] field=${field} account=${entryId || candidates[0] || "?"} queued.`);
    }
    if (entryId && /^act_\d+$/.test(entryId.startsWith("act_") ? entryId : `act_${entryId}`)) {
      accountIds.add(entryId.startsWith("act_") ? entryId : `act_${entryId}`);
    }
  }

  if (accountIds.size > 0) {
    requestPrioritySync([...accountIds]);
  } else if (entries.length > 0) {
    // Payload without a parseable account id: fall back to one bounded
    // reconciliation pass (lock-protected, backoff-aware).
    fullReconcile = true;
    void runFullReconcile("webhook-fallback");
  }

  if (fullReconcile) console.log("[meta-webhook] No account id parsed; triggered bounded reconcile.");
}
