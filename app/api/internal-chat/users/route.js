import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import { listInternalEligibleUsers } from "@/lib/internalChatModel";
import { ROLE_LABELS } from "@/lib/rbacCatalog";
import { isUidOnline } from "@/lib/sseManager";

export async function GET(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const search = String(searchParams.get("search") || "").trim().slice(0, 100);
  const users = await listInternalEligibleUsers({ excludeUid: auth.uid, search });
  return NextResponse.json({
    success: true,
    users: users.map((u) => ({
      uid: u.uid,
      displayName: u.displayName || u.email || "User",
      email: u.email || "",
      role: u.role,
      designation: ROLE_LABELS[u.role] || String(u.role || "").replace(/_/g, " "),
      avatar: u.avatar || null,
      online: isUidOnline(u.uid),
    })),
  });
}
