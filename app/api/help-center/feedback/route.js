import { NextResponse } from "next/server";
import { submitFeedback } from "@/lib/helpCenterModel";

export async function POST(request) {
  try {
    const body = await request.json();
    const { articleId, userId, helpful } = body;
    if (!articleId) {
      return NextResponse.json({ success: false, message: "articleId required" }, { status: 400 });
    }
    const res = await submitFeedback({ articleId, userId: userId || null, helpful: !!helpful });
    if (!res.ok) {
      return NextResponse.json({ success: false, message: res.reason || "Failed" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
