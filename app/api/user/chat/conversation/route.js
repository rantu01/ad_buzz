import { NextResponse } from "next/server";
import { getOrCreateConversation, getConversationByCustomer } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    const conv = await getOrCreateConversation({ customerId: uid, customerName: user.displayName || user.email || "", customerEmail: user.email || "" });
    return NextResponse.json({ success: true, conversation: conv });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
