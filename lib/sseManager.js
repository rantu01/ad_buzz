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
});
const { clientsByUid, channelClients, presenceClients, offlineTimers } = state;

function cancelOffline(uid) {
  const timer = offlineTimers.get(uid);
  if (timer) clearTimeout(timer);
  offlineTimers.delete(uid);
}

function scheduleOffline(uid, announce) {
  cancelOffline(uid);
  const timer = setTimeout(() => {
    offlineTimers.delete(uid);
    // Only publish if no connection came back during the grace window.
    if (announce && !isUidOnline(uid)) {
      emitToChannel("admin:chat", "internal:presence", { uid, online: false });
    }
  }, OFFLINE_GRACE_MS);
  timer.unref?.();
  offlineTimers.set(uid, timer);
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

export function registerClient({ id, uid, write, presence = true, announce = presence }) {
  const entry = {
    id, uid, write,
    presence: Boolean(presence),
    announce: Boolean(announce),
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

  // Presence is only for real (known) users. Delivery registration above is
  // still needed for customers, who receive targeted messages/calls.
  if (uid && entry.presence) {
    cancelOffline(uid);
    let peers = presenceClients.get(uid);
    if (!peers) { peers = new Set(); presenceClients.set(uid, peers); }
    const first = peers.size === 0;
    peers.add(entry);
    if (first && entry.announce) {
      emitToChannel("admin:chat", "internal:presence", { uid, online: true });
      // Give the newly connected client the current state of everybody else so
      // every viewer converges without a page refresh. Only staff presence is
      // announced; customers stay out of these UI events.
      for (const [otherUid, peers] of presenceClients) {
        if (otherUid !== uid && peers.values().next().value?.announce) {
          safeWrite(entry, presenceFrame({ uid: otherUid, online: true }));
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
          scheduleOffline(uid, entryToRemove.announce);
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

export function emitToUser(uid, event, data) {
  const list = clientsByUid.get(uid);
  if (!list || list.size === 0) return;
  const frame = formatEvent(event, data);
  for (const client of list) {
    safeWrite(client, frame);
  }
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

