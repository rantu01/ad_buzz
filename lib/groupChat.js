// Pure group/membership rules shared by the internal chat model and routes.
// No database, no framework imports — unit tested directly.

export const GROUP_ADMIN = "admin";
export const GROUP_MEMBER = "member";
export const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function normalizeGroupName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 100);
}

export function normalizeGroupDescription(value) {
  return String(value || "").trim().slice(0, 500);
}

// Validate a creation request using only the actor's identity and real uids
// supplied by the client. The route re-verifies every uid against the users
// collection before writing anything.
export function validateGroupCreate({ name, actorUid, memberUids }) {
  const cleanName = normalizeGroupName(name);
  if (!cleanName) return { ok: false, error: "Group name is required." };
  if (!actorUid) return { ok: false, error: "You must be signed in." };
  const members = [...new Set((memberUids || []).filter((uid) => typeof uid === "string" && uid && uid !== actorUid))];
  if (members.length < 1) return { ok: false, error: "Select at least one member." };
  if (members.length > 49) return { ok: false, error: "A group can have at most 50 members." };
  return { ok: true, name: cleanName, members: [actorUid, ...members] };
}

export function isGroupConversation(conv) {
  return Boolean(conv && (conv.type === "group" || conv.isGroup === true));
}

export function groupAdmins(conv) {
  return Array.isArray(conv?.admins) ? conv.admins : (conv?.createdBy ? [conv.createdBy] : []);
}

export function isGroupAdmin(conv, uid) {
  return Boolean(uid && groupAdmins(conv).includes(uid));
}

export function canManageGroup(conv, uid) {
  return isGroupConversation(conv) && isGroupAdmin(conv, uid);
}

export function canRemoveMember(conv, actorUid, targetUid) {
  if (!canManageGroup(conv, actorUid)) return false;
  if (!targetUid || targetUid === conv.createdBy) return false;
  return (conv.participants || []).includes(targetUid);
}

export function canLeaveGroup(conv, uid) {
  if (!isGroupConversation(conv) || !(conv.participants || []).includes(uid)) return false;
  // The creator owns the group; they delete it or transfer ownership instead
  // of silently abandoning it.
  return conv.createdBy !== uid;
}

export function normalizeEmoji(value) {
  const emoji = String(value || "").trim();
  return ALLOWED_REACTIONS.includes(emoji) ? emoji : "";
}

// Toggling a reaction is idempotent and one reaction per user per emoji.
export function toggleReaction(reactions, uid, emoji) {
  if (!uid || !emoji) return reactions || [];
  const list = Array.isArray(reactions) ? reactions : [];
  const existing = list.find((r) => r.uid === uid && r.emoji === emoji);
  if (existing) return list.filter((r) => r !== existing);
  return [...list, { uid, emoji, at: new Date().toISOString() }];
}

export function reactionSummary(reactions) {
  const list = Array.isArray(reactions) ? reactions : [];
  const summary = new Map();
  for (const reaction of list) {
    const current = summary.get(reaction.emoji) || [];
    current.push(reaction.uid);
    summary.set(reaction.emoji, current);
  }
  return [...summary.entries()].map(([emoji, uids]) => ({ emoji, count: uids.length, uids }));
}
