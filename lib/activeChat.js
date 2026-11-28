// Tiny client-only registry so the global call provider can avoid showing a
// toast / desktop notification for a message in the conversation the user is
// currently reading. No React state, no re-renders, no persistence.
let active = { conversationId: null, system: null };

export function setActiveConversation(conversationId, system) {
  active = { conversationId: conversationId || null, system: system || null };
}

export function isActiveConversation(conversationId, system) {
  return Boolean(conversationId) && active.conversationId === conversationId &&
    (!system || !active.system || active.system === system);
}
