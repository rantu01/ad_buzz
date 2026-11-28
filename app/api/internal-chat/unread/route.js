import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import { getTotalInternalUnread } from "@/lib/internalChatModel";

export async function GET(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  const unread = await getTotalInternalUnread(auth.uid);
  return NextResponse.json({ success: true, unread });
}
