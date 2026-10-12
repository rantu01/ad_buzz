import { registerClient, subscribeChannel, sendHeartbeat } from "@/lib/sseManager";
import { startAutoMetaFetch } from "@/lib/autoMetaFetch";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

startAutoMetaFetch();

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

// Staff roles are anything that is not a plain customer (admin,
// technical_manager, key_manager, accounts_manager, support_executive, ...).
async function isStaffUid(uid) {
  if (!uid) return false;
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const user = await db.collection("users").findOne({ uid }, { projection: { role: 1 } });
    // Unknown uid (lookup miss): treat as non-staff so account payloads are
    // only delivered to verified owners. Staff pages always have a users doc.
    return Boolean(user) && user.role !== "customer";
  } catch (err) {
    // DB outage must not break the admin UI: fail open to the previous
    // behavior (subscribe) and log. Account-data scoping in metaEvents.js
    // still limits customer delivery to assigned owners.
    console.error("[sse] Staff lookup failed, subscribing to admin:meta:", err.message);
    return true;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid") || null;
  const channels = searchParams.getAll("channel");
  // Resolve staff membership once per (long-lived) connection so only staff
  // dashboards auto-receive the admin:meta account feed. Customers receive
  // only their own assigned accounts via targeted emitToUser delivery.
  const staff = await isStaffUid(uid);

  const encoder = new TextEncoder();
  let streamCleanup = null;
  const stream = new ReadableStream({
    start(controller) {
      let active = true;
      let unregister = () => {};
      let heartbeat;

      const write = (frame) => {
        if (active) controller.enqueue(encoder.encode(frame));
      };

      controller.enqueue(encoder.encode(`retry: 15000\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true, uid })}\n\n`));

      const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

      unregister = registerClient({ id: clientId, uid, write });
      for (const c of channels) {
        try { subscribeChannel(clientId, c); } catch {}
      }
      // Admin dashboard pages listen on admin:meta for sync/meta events.
      // Auto-subscribe staff only, so customer browsers do not passively
      // receive other customers' account payloads. Explicit ?channel=
      // requests are still honored (existing behavior).
      if (staff) {
        try { subscribeChannel(clientId, "admin:meta"); } catch {}
      }

      heartbeat = setInterval(() => {
        try { sendHeartbeat(clientId); } catch {}
      }, 25000);

      const cleanup = () => {
        if (!active) return;
        active = false;
        clearInterval(heartbeat);
        unregister();
        try { controller.close(); } catch {}
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
      streamCleanup = cleanup;
    },
    cancel() {
      streamCleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
