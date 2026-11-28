import { NextResponse } from "next/server";
import { requireInternalChatUser } from "@/lib/internalChatAuth";
import {
  createInternalGroup,
  getInternalUsersByUids,
  listInternalGroups,
} from "@/lib/internalChatModel";
import { validateGroupCreate } from "@/lib/groupChat";
import { emitToUser, isUidOnline } from "@/lib/sseManager";

// Groups are real internalConversations documents. Every write is authorized
// with a verified Firebase token and every member uid is checked against the
// users collection before a record is created.
export async function POST(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }
  const validation = validateGroupCreate({
    name: body?.name,
    actorUid: auth.uid,
    memberUids: Array.isArray(body?.memberUids) ? body.memberUids : [],
  });
  if (!validation.ok) return NextResponse.json({ success: false, message: validation.error }, { status: 400 });

  try {
    const users = await getInternalUsersByUids(validation.members);
    if (users.length !== validation.members.length) {
      return NextResponse.json({ success: false, message: "One or more selected users no longer exist." }, { status: 404 });
    }
    const conversation = await createInternalGroup({
      name: validation.name,
      description: typeof body.description === "string" ? body.description.slice(0, 500) : "",
      creatorUid: auth.uid,
      memberUids: validation.members,
    });
    const payload = {
      action: "created",
      conversationId: conversation.conversationId,
      conversation: withOnline(conversation),
      byUid: auth.uid,
      system: "internal",
    };
    for (const uid of conversation.participants) {
      emitToUser(uid, "internal:group", payload);
      emitToUser(uid, "internal:conversation", { conversation: payload.conversation, system: "internal" });
    }
    return NextResponse.json({ success: true, conversation: payload.conversation });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Could not create group" }, { status: 500 });
  }
}

export async function GET(request) {
  const auth = await requireInternalChatUser(request);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  try {
    const groups = (await listInternalGroups(auth.uid)).map(withOnline);
    return NextResponse.json({ success: true, groups });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

function withOnline(conversation) {
  return {
    ...conversation,
    people: (conversation.people || []).map((person) => ({
      ...person,
      online: isUidOnline(person?.uid),
    })),
  };
}
