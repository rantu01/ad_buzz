import { emitToChannel, emitToUser } from "./sseManager";
import clientPromise from "./mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

// Scoped delivery for Meta account change events.
//
// - Admin/staff dashboards listen on the `admin:meta` channel: they receive
//   every account event (unchanged behavior for staff).
// - Regular customers must NOT receive other customers' account data, so the
//   same payload is additionally delivered directly to the uid the account
//   is assigned to (user pages listen on their shared SSE connection with
//   no channel subscription and apply row-level patches).
// - Unassigned accounts, or accounts whose assignment lookup fails, reach
//   staff via the channel only (fail closed for customer delivery).
//
// Status-only events (`meta-status`, legacy `sync`) carry no account data
// and continue to use broadcast emitToAll at the call site.

export async function emitMetaAccountEvent(event, payload, metaAccountId) {
  emitToChannel("admin:meta", event, payload);
  if (!metaAccountId) return;
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const doc = await db
      .collection("adAccounts")
      .findOne({ metaAccountId }, { projection: { uid: 1 } });
    if (doc?.uid) emitToUser(doc.uid, event, payload);
  } catch (err) {
    console.error("[meta-events] Assignment lookup failed, staff-only delivery:", err.message);
  }
}

// Batched variant: one assignment query for many events (reconcile path).
// events: [{ event, payload, metaAccountId }]
export async function emitMetaAccountEvents(events) {
  if (!events || events.length === 0) return;
  for (const { event, payload } of events) {
    emitToChannel("admin:meta", event, payload);
  }
  try {
    const ids = [...new Set(events.map((e) => e.metaAccountId).filter(Boolean))];
    if (ids.length === 0) return;
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const docs = await db
      .collection("adAccounts")
      .find({ metaAccountId: { $in: ids } }, { projection: { metaAccountId: 1, uid: 1 } })
      .toArray();
    const uidByMetaId = new Map(docs.map((d) => [d.metaAccountId, d.uid]));
    for (const { event, payload, metaAccountId } of events) {
      const uid = uidByMetaId.get(metaAccountId);
      if (uid) emitToUser(uid, event, payload);
    }
  } catch (err) {
    console.error("[meta-events] Batched assignment lookup failed, staff-only delivery:", err.message);
  }
}
