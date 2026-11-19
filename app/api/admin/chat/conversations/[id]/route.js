import { NextResponse } from "next/server";
import { getConversationById, updateConversation, assignConversation, setConversationStatus } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";
import { isStaffRole } from "@/lib/permissions";

export async function GET(request, { params }) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const { id } = await params;
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user || !isStaffRole(user.role)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const conv = await getConversationById(id);
    if (!conv) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, conversation: conv });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const body = await request.json();
    const { uid, action, assignedStaffId, assignedStaffName, status } = body || {};
    const { id } = await params;
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user || !isStaffRole(user.role)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    if (action === "assign") {
      const conv = await assignConversation(id, assignedStaffId, assignedStaffName);
      return NextResponse.json({ success: true, conversation: conv });
    }
    if (action === "status") {
      const conv = await setConversationStatus(id, status);
      return NextResponse.json({ success: true, conversation: conv });
    }
    // generic update
    const conv = await updateConversation(id, body.updates || {});
    return NextResponse.json({ success: true, conversation: conv });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
