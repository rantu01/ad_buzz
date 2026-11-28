import { requireInternalChatUser } from "@/lib/internalChatAuth";
import { getConversationForParticipant } from "@/lib/internalChatModel";
import { isGroupConversation, isGroupAdmin } from "@/lib/groupChat";

// Single authorization entry point for every group endpoint: verified token,
// real membership in the group document, and (optionally) admin role.
export async function requireGroupMember(request, conversationId, { adminOnly = false } = {}) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return auth;
  const conv = await getConversationForParticipant(conversationId, auth.uid);
  if (!conv || !isGroupConversation(conv)) {
    return { ok: false, status: 404, message: "Group not found" };
  }
  if (adminOnly && !isGroupAdmin(conv, auth.uid)) {
    return { ok: false, status: 403, message: "Group admin access required" };
  }
  return { ...auth, conv };
}
