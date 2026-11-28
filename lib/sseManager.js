const MAX_CLIENTS = 200;
// A short grace window prevents "offline" flicker during reconnects / tab
// reloads: the new connection registers before the old one is reaped.
const OFFLINE_GRACE_MS = 4000;
// Connections that have not produced a successful heartbeat in this long are
// treated as stale (half-open sockets, sleeping devices, etc.).
const STALE_AFTER_MS = 90000;

// Next.js bundles route handlers separately: a plain module-level Map gives
// /api/events and every other API route a DIFFERENT registry, so emits from
// message/presence routes never reach the live streams. Keep the registry on
// globalThis so all route bundles in the same process share it.
const state = (globalThis.__adBuzzSseState ||= {
  clientsByUid: new Map(),  // uid -> Set<entry> (all live streams, for delivery)
  channelClients: new Map(), // id -> entry
  presenceClients: new Map(), // uid -> Set<entry> (verified/known users only)
  offlineTimers: new Map(), // uid -> timeout
  // Per-call coordination. This is ephemeral coordination state, not chat
  // data: the authoritative call record still lives in Mongo. It lets us
  // answer "has another device already claimed this call?" in one step and
  // stop duplicate ringing across every device of the intended recipient.
  callClaims: new Map(), // callId -> { byUid, byClientId, status, updatedAt }
});
const { clientsByUid, channelClients, presenceClients, offlineTimers, callClaims } = state;

const CLAIM_TTL_MS = 5 * 60 * 1000;

function cancelOffline(uid) {
  const timer = offlineTimers.get(uid);
  if (timer) clearTimeout(timer);
  offlineTimers.delete(uid);
}

function scheduleOffline(uid, announce, onPresenceChange) {
  cancelOffline(uid);
  const timer = setTimeout(() => {
    offlineTimers.delete(uid);
    // Only publish if no connection came back during the grace window.
    if (announce && !isUidOnline(uid)) {
      emitToChannel("admin:chat", "internal:presence", { uid, online: false });
      notifyPresenceChange(onPresenceChange, uid, false);
    }
  }, OFFLINE_GRACE_MS);
  timer.unref?.();
  offlineTimers.set(uid, timer);
}

function notifyPresenceChange(callback, uid, online) {
  if (typeof callback !== "function") return;
  try {
    Promise.resolve(callback(uid, online)).catch((error) => {
      console.error("[sse] Presence notification failed:", error?.message || error);
    });
  } catch (error) {
    console.error("[sse] Presence notification failed:", error?.message || error);
  }
}

function presenceFrame(data) {
  return formatEvent("internal:presence", data);
}

function sweepStale() {
  const now = Date.now();
  for (const entry of [...channelClients.values()]) {
    if (now - (entry.lastSeen || 0) > STALE_AFTER_MS) unregisterClient(entry.id, entry);
  }
}

export function registerClient({ id, uid, write, presence = true, announce = presence, onPresenceChange = null }) {
  const entry = {
    id, uid, write,
    presence: Boolean(presence),
    announce: Boolean(announce),
    onPresenceChange,
    channels: new Set(),
    lastSeen: Date.now(),
  };
  sweepStale();

  if (uid) {
    let list = clientsByUid.get(uid);
    if (!list) { list = new Set(); clientsByUid.set(uid, list); }
    list.add(entry);
  }

  channelClients.set(id, entry);

  if (channelClients.size > MAX_CLIENTS) {
    const oldestId = channelClients.keys().next().value;
    const oldest = channelClients.get(oldestId);
    if (oldest) unregisterClient(oldestId, oldest);
  }

  // Presence is only for real (known) users. Staff-only subscribers receive
  // the presence events, including customer availability in support chat.
  if (uid && entry.presence) {
    cancelOffline(uid);
    let peers = presenceClients.get(uid);
    if (!peers) { peers = new Set(); presenceClients.set(uid, peers); }
    const first = peers.size === 0;
    peers.add(entry);
    if (first) {
      emitToChannel("admin:chat", "internal:presence", { uid, online: true });
      notifyPresenceChange(entry.onPresenceChange, uid, true);
      // Only staff subscribers receive channel events; send them current
      // presence for all known users when their first stream connects.
      if (entry.announce) {
        for (const [otherUid] of presenceClients) {
          if (otherUid !== uid && isUidOnline(otherUid)) {
            safeWrite(entry, presenceFrame({ uid: otherUid, online: true }));
          }
        }
      }
    }
  }

  return () => unregisterClient(id, entry);
}

export function unregisterClient(id, entry) {
  const entryToRemove = entry || channelClients.get(id);
  channelClients.delete(id);
  if (!entryToRemove) return;

  const uid = entryToRemove.uid;
  if (uid) {
    const list = clientsByUid.get(uid);
    if (list) {
      list.delete(entryToRemove);
      if (list.size === 0) clientsByUid.delete(uid);
    }
    if (entryToRemove.presence) {
      const peers = presenceClients.get(uid);
      if (peers) {
        peers.delete(entryToRemove);
        if (peers.size === 0) {
          presenceClients.delete(uid);
          scheduleOffline(uid, entryToRemove.presence, entryToRemove.onPresenceChange);
        }
      }
    }
  }
}

// Uids with at least one live presence-enabled connection.
export function getOnlineUids() {
  return [...presenceClients.keys()];
}

export function isUidOnline(uid) {
  if (!uid) return false;
  const peers = presenceClients.get(uid);
  if (!peers || peers.size === 0) return false;
  // Ignore connections whose heartbeat has gone stale.
  for (const entry of peers) {
    if (Date.now() - (entry.lastSeen || 0) <= STALE_AFTER_MS) return true;
  }
  return false;
}

function freshClaim(callId) {
  const claim = callClaims.get(callId);
  if (!claim) return null;
  if (Date.now() - claim.updatedAt > CLAIM_TTL_MS) {
    callClaims.delete(callId);
    return null;
  }
  return claim;
}

// Atomically claim an incoming call for one device. All other devices of the
// same recipient (and every other user) keep receiving status updates, but
// only the claiming device proceeds with WebRTC. Calling again with the same
// clientId is idempotent, so retries never create a second call session.
export function claimCall({ callId, uid, clientId }) {
  if (!callId || !uid) return { claimed: false, claim: null };
  const existing = freshClaim(callId);
  // Idempotent only for the same device. A second device — even of the same
  // user — must never open a duplicate call session.
  if (existing) {
    const sameDevice = Boolean(existing.byClientId && clientId && existing.byClientId === clientId);
    if (!sameDevice) return { claimed: false, claim: existing };
  }
  const claim = {
    byUid: uid,
    byClientId: clientId || null,
    status: "accepted",
    updatedAt: Date.now(),
  };
  callClaims.set(callId, claim);
  return { claimed: true, claim };
}

export function getCallClaim(callId) {
  return callId ? freshClaim(callId) : null;
}

export function setCallClaimStatus(callId, status) {
  const claim = freshClaim(callId);
  if (claim && status) {
    claim.status = status;
    claim.updatedAt = Date.now();
  }
  return claim;
}

export function releaseCallClaim(callId, clientId) {
  const claim = freshClaim(callId);
  if (!claim) return;
  if (clientId && claim.byClientId && claim.byClientId !== clientId) return;
  callClaims.delete(callId);
}

export function emitToUser(uid, event, data, options = {}) {
  const list = clientsByUid.get(uid);
  if (!list || list.size === 0) return;
  const frame = formatEvent(event, data);
  for (const client of list) {
    if (options.excludeClientId && client.id === options.excludeClientId) continue;
    if (options.onlyClientId && client.id !== options.onlyClientId) continue;
    safeWrite(client, frame);
  }
}

export function emitToClient(clientId, event, data) {
  const client = channelClients.get(clientId);
  if (client) safeWrite(client, formatEvent(event, data));
}

export function emitToAll(event, data) {
  if (channelClients.size === 0) return;
  const frame = formatEvent(event, data);
  for (const client of channelClients.values()) {
    safeWrite(client, frame);
  }
}

export function subscribeChannel(clientId, channel) {
  const client = channelClients.get(clientId);
  if (!client) return;
  client.channels.add(channel);
  // Never resurrect a client that was already unregistered.
  if (client.uid && channelClients.has(clientId) && !clientsByUid.get(client.uid)?.has(client)) {
    let list = clientsByUid.get(client.uid);
    if (!list) { list = new Set(); clientsByUid.set(client.uid, list); }
    list.add(client);
    if (client.presence) {
      let peers = presenceClients.get(client.uid);
      if (!peers) { peers = new Set(); presenceClients.set(client.uid, peers); }
      peers.add(client);
      cancelOffline(client.uid);
    }
  }
}

export function emitToChannel(channel, event, data) {
  const frame = formatEvent(event, data);
  for (const client of channelClients.values()) {
    if (client.channels.has(channel)) safeWrite(client, frame);
  }
}

// Returns false when the client write fails; the caller should close the
// stream so a half-open connection cannot stay marked Online forever.
export function sendHeartbeat(clientId) {
  const client = channelClients.get(clientId);
  if (!client) return false;
  sweepStale();
  try {
    client.write(": keep-alive\n\n");
    client.lastSeen = Date.now();
    return true;
  } catch {
    unregisterClient(clientId, client);
    return false;
  }
}

function formatEvent(event, data) {
  let out = "\n";
  if (event) out += `event: ${event}\n`;
  out += `data: ${JSON.stringify(data)}\n\n`;
  return out;
}

function safeWrite(client, frame) {
  try {
    client.write(frame);
    client.lastSeen = Date.now();
  } catch {
    unregisterClient(client.id, client);
  }
}

export function getClientCount() {
  return channelClients.size;
}

export function getChannelSubscriberCount(channel) {
  let n = 0;
  for (const client of channelClients.values()) {
    if (client.channels.has(channel)) n++;
  }
  return n;
}

export function getUidClientCount(uid) {
  return clientsByUid.get(uid)?.size || 0;
}

