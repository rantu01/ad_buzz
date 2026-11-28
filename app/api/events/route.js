import { registerClient, subscribeChannel, sendHeartbeat, emitToUser } from "@/lib/sseManager";
import { startAutoMetaFetch } from "@/lib/autoMetaFetch";
import clientPromise from "@/lib/mongodb";
import { isStaffRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

startAutoMetaFetch();

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

// One lookup per long-lived connection: staff gating (unchanged semantics)
// plus "known user" gating for presence, so only real user documents can be
// marked online. No fake/dummy presence rows are ever created.
async function getSseIdentity(uid) {
  if (!uid) return { staff: false, known: false };
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const user = await db.collection("users").findOne({ uid }, { projection: { role: 1 } });
    return {
      known: Boolean(user),
      staff: Boolean(user) && isStaffRole(user.role),
    };
  } catch (err) {
    // DB outage must not break the admin UI: keep the previous fail-open
    // staff behavior, but do not publish presence for an unverified uid.
    console.error("[sse] Staff lookup failed, subscribing to admin:meta:", err.message);
    return { staff: true, known: false };
  }
}

async function notifyAssignedCustomers(staffUid, online) {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const conversations = db.collection("chatConversations")
    .find({ assignedStaffId: staffUid })
    .project({ customerId: 1 });
  for await (const conversation of conversations) {
    if (conversation.customerId) {
      emitToUser(conversation.customerId, "chat:presence", { uid: staffUid, online });
    }
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid") || null;
  // Resolve staff membership once per (long-lived) connection so only staff
  // dashboards auto-receive the admin:meta account feed. Customers receive
  // only their own assigned accounts via targeted emitToUser delivery.
  const { staff, known } = await getSseIdentity(uid);
  // Staff-only channels must never be subscribable by a customer-supplied
  // query param: they carry account payloads and WebRTC signaling.
  const STAFF_ONLY_CHANNELS = new Set(["admin:meta", "admin:chat"]);
  const channels = searchParams
    .getAll("channel")
    .filter((channel) => !STAFF_ONLY_CHANNELS.has(channel) || staff);

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

      const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      controller.enqueue(encoder.encode(`retry: 15000\n\n`));
      // Exposing this connection id lets the call provider stamp signals with
      // the exact device they came from. The server uses it to claim a call
      // once and to stop ringing on every other device of the same user.
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true, uid, clientId })}\n\n`));

      unregister = registerClient({
        id: clientId,
        uid,
        write,
        presence: known,
        announce: known && staff,
        onPresenceChange: known && staff ? notifyAssignedCustomers : null,
      });
      for (const c of channels) {
        try { subscribeChannel(clientId, c); } catch {}
      }
      // Admin dashboard pages listen on admin:meta for sync/meta events.
      // Auto-subscribe staff only, so customer browsers do not passively
      // receive other customers' account payloads. Explicit ?channel=
      // requests are still honored (existing behavior).
      if (staff) {
        try { subscribeChannel(clientId, "admin:meta"); } catch {}
        try { subscribeChannel(clientId, "admin:chat"); } catch {}
      }

      heartbeat = setInterval(() => {
        try {
          // A failed heartbeat means the socket is gone (half-open connection,
          // sleeping device, etc.). Close the stream so presence is reaped by
          // server-side disconnect handling rather than relying on beforeunload.
          if (!sendHeartbeat(clientId)) cleanup();
        } catch {}
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
