import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getUserByUid, updateUserByUid } from "@/lib/userModel";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    }

    const user = await getUserByUid(uid);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { uid, displayName, phoneNumber } = body;

    if (!uid) {
      return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    }

    const name = typeof displayName === "string" ? displayName.trim() : "";
    if (!name) {
      return NextResponse.json({ success: false, message: "Display name is required." }, { status: 400 });
    }

    const updates = { displayName: name };
    if (phoneNumber !== undefined) updates.phoneNumber = String(phoneNumber).trim();

    const user = await updateUserByUid(uid, updates);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, user });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
