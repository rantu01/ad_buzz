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

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { uid, displayName, phoneNumber, avatar } = body;

    if (!uid) {
      return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    }

    const updates = {};
    if (displayName !== undefined) {
      const name = typeof displayName === "string" ? displayName.trim() : "";
      if (!name) {
        return NextResponse.json({ success: false, message: "Display name is required." }, { status: 400 });
      }
      updates.displayName = name;
    }
    if (phoneNumber !== undefined) updates.phoneNumber = String(phoneNumber).trim();

    // Profile pictures are stored as base64 data URLs on the user document,
    // matching the existing image-storage pattern used elsewhere in the app.
    if (avatar !== undefined) {
      if (avatar === null || avatar === "") {
        updates.avatar = null;
      } else if (typeof avatar !== "string" || !AVATAR_DATA_URL.test(avatar)) {
        return NextResponse.json({ success: false, message: "Invalid profile picture format." }, { status: 400 });
      } else if (Buffer.byteLength(avatar, "utf8") > AVATAR_MAX_BYTES * 1.4) {
        return NextResponse.json({ success: false, message: "Profile picture must be smaller than 2 MB." }, { status: 400 });
      } else {
        updates.avatar = avatar;
      }
    }

    const user = await updateUserByUid(uid, updates);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, user });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
