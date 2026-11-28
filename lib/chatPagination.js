// Shared, dependency-free helpers for chat history pagination and real-time
// message merging. Safe to import from both client components and API routes.

// Only the most recent page of a conversation is loaded up front. Older pages
// are fetched on demand as the reader scrolls toward the top.
export const CHAT_PAGE_SIZE = 25;

export function messageKey(message) {
  if (!message) return "";
  return String(message.clientId || message.messageId || "");
}

/** Remove duplicate messages (by clientId/messageId) while keeping order. */
export function dedupeMessages(messages) {
  const seen = new Set();
  const result = [];
  for (const message of messages || []) {
    const key = messageKey(message);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(message);
  }
  return result;
}

/**
 * Prepend an older page to the messages already loaded, without duplicating
 * anything that arrived through SSE or an optimistic send in the meantime.
 */
export function mergeOlderMessages(current, older) {
  const seen = new Set((current || []).map(messageKey).filter(Boolean));
  const added = [];
  for (const message of older || []) {
    const key = messageKey(message);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    added.push(message);
  }
  return dedupeMessages([...added, ...(current || [])]);
}

/**
 * Insert/replace a single message (SSE echo of an optimistic send, read
 * receipt, retry, etc.) by messageId or clientId. Never duplicates a message.
 */
export function upsertMessage(current, incoming) {
  const key = messageKey(incoming);
  if (!key) return dedupeMessages([...(current || []), incoming]);
  const index = (current || []).findIndex((m) =>
    (incoming.messageId && m.messageId === incoming.messageId) ||
    (incoming.clientId && m.clientId === incoming.clientId)
  );
  if (index < 0) return [...(current || []), incoming];
  const next = [...current];
  next[index] = incoming;
  return next;
}

/**
 * Normalize the result of a history API call. `hasMore` is authoritative when
 * supplied by the server; the length heuristic keeps older clients working.
 */
export function normalizePage(data, pageSize = CHAT_PAGE_SIZE) {
  const messages = data?.messages || [];
  return {
    messages,
    hasMore: typeof data?.hasMore === "boolean" ? data.hasMore : messages.length >= pageSize,
    nextCursor: data?.nextCursor || messages[0]?.createdAt || null,
  };
}
