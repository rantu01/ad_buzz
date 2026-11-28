import { NextResponse } from "next/server";
import { listConversations, getConversationById, getOrCreateConversation, getUserByUid, getUsersByUids } from "@/lib/chatModel";
import { isStaffRole } from "@/lib/permissions";
import { isUidOnline } from "@/lib/sseManager";

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
    const customers = await getUsersByUids(result.items.map((conversation) => conversation.customerId));
    const customerByUid = new Map(customers.map((customer) => [customer.uid, customer]));
    return NextResponse.json({
      success: true,
      ...result,
      items: result.items.map((conversation) => {
        const customer = customerByUid.get(conversation.customerId);
        return {
          ...conversation,
          customerName: customer?.displayName || conversation.customerName,
          customerEmail: customer?.email || conversation.customerEmail,
          customerAvatar: customer?.avatar || null,
          customerOnline: isUidOnline(conversation.customerId),
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
