import { NextResponse } from "next/server";
import { getStaffUsers } from "@/lib/chatModel";
import { getUserByUid } from "@/lib/chatModel";
import { isStaffRole } from "@/lib/permissions";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    if (!uid) return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    const user = await getUserByUid(uid);
    if (!user || !isStaffRole(user.role)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    const staff = await getStaffUsers();
    return NextResponse.json({ success: true, staff });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
