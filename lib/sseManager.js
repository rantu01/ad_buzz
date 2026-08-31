const MAX_CLIENTS = 200;

const clientsByUid = new Map();
const channelClients = new Map();

export function registerClient({ id, uid, write }) {
  const entry = { id, uid, write, channels: new Set() };

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

  return () => unregisterClient(id, entry);
}

export function unregisterClient(id, entry) {
  const entryToRemove = entry || channelClients.get(id);
  channelClients.delete(id);
  if (!entryToRemove) return;

  if (entryToRemove.uid) {
    const list = clientsByUid.get(entryToRemove.uid);
    if (list) {
      list.delete(entryToRemove);
      if (list.size === 0) clientsByUid.delete(entryToRemove.uid);
    }
  }
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
  if (client.uid && !clientsByUid.get(client.uid)?.has(client)) {
    let list = clientsByUid.get(client.uid);
    if (!list) { list = new Set(); clientsByUid.set(client.uid, list); }
    list.add(client);
  }
}

export function emitToChannel(channel, event, data) {
  const frame = formatEvent(event, data);
  for (const client of channelClients.values()) {
    if (client.channels.has(channel)) safeWrite(client, frame);
  }
}

export function sendHeartbeat(clientId) {
  const client = channelClients.get(clientId);
  if (client) safeWrite(client, ": keep-alive\n\n");
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
  } catch {
    // Client disconnected; will be cleaned up on close.
  }
}

export function getClientCount() {
  return channelClients.size;
}

export function getUidClientCount(uid) {
  return clientsByUid.get(uid)?.size || 0;
}
