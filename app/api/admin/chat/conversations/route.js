import { NextResponse } from "next/server";
import { listConversations, getConversationById, getOrCreateConversation } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";
import { isStaffRole } from "@/lib/permissions";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user || !isStaffRole(user.role)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";
    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 30);
    const assigned = searchParams.get("assigned") === "me" ? uid : (searchParams.get("assignedStaffId") || undefined);
    const result = await listConversations({ status, search, page, limit, assignedStaffId: assigned });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
