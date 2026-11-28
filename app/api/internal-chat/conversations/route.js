import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import {
  getOrCreateInternalConversation,
  listInternalConversations,
  internalUnreadCount,
  peerOf,
} from "@/lib/internalChatModel";
import { getInternalUser } from "@/lib/internalChatModel";
import { isStaffRole } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/rbacCatalog";
import { isUidOnline, emitToUser } from "@/lib/sseManager";

function withPeer(conv, uid) {
  const peer = peerOf(conv, uid);
  return {
    ...conv,
    peer: peer
      ? {
          uid: peer.uid,
          displayName: peer.displayName || peer.email || "User",
          email: peer.email || "",
          role: peer.role,
          designation: ROLE_LABELS[peer.role] || String(peer.role || "").replace(/_/g, " "),
          avatar: peer.avatar || null,
          online: isUidOnline(peer.uid),
        }
      : null,
    unread: internalUnreadCount(conv, uid),
  };
}

export async function GET(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const result = await listInternalConversations(auth.uid, {
    search: String(searchParams.get("search") || "").trim().slice(0, 100),
    page: searchParams.get("page") || 1,
    limit: searchParams.get("limit") || 30,
  });
  return NextResponse.json({
    success: true,
    ...result,
    items: result.items.map((conv) => withPeer(conv, auth.uid)),
  });
}

export async function POST(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  let peerUid;
  try {
    ({ peerUid } = await request.json());
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  peerUid = String(peerUid || "").trim();
  if (!peerUid) return NextResponse.json({ success: false, message: "peerUid required" }, { status: 400 });
  if (peerUid === auth.uid) return NextResponse.json({ success: false, message: "You cannot chat with yourself" }, { status: 400 });

  const peer = await getInternalUser(peerUid);
  if (!peer || !isStaffRole(peer.role)) {
    return NextResponse.json({ success: false, message: "That user is not eligible for internal chat" }, { status: 403 });
  }

  try {
    const conv = await getOrCreateInternalConversation(auth.uid, peerUid);
    const result = withPeer(conv, auth.uid);
    // Both participants converge on the same conversation; tell the other one
    // immediately so their list updates without a refresh. Send the raw
    // document: each client resolves "peer" from its own uid.
    emitToUser(peerUid, "internal:conversation", { conversation: conv, system: "internal" });
    return NextResponse.json({ success: true, conversation: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Could not open conversation" }, { status: 500 });
  }
}
