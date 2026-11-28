import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import { getConversationForParticipant, getInternalSharedContentPage } from "@/lib/internalChatModel";

export async function GET(request, { params }) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  const { id } = await params;
  const conversation = await getConversationForParticipant(id, auth.uid);
  if (!conversation) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
  const { searchParams } = new URL(request.url);
  const page = await getInternalSharedContentPage(id, {
    kind: searchParams.get("kind"),
    before: searchParams.get("before"),
    limit: searchParams.get("limit"),
  });
  return NextResponse.json({ success: true, ...page });
}
