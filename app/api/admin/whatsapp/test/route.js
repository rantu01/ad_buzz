import { NextResponse } from "next/server";
import { sendWhatsAppMessage } from "@/lib/whatsappService";

export async function POST(request) {
  try {
    const body = await request.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return NextResponse.json({ success: false, message: "Phone and message are required" }, { status: 400 });
    }

    const result = await sendWhatsAppMessage(phone, message);
    if (result.success) {
      return NextResponse.json({ success: true, msgId: result.msgId });
    }
    return NextResponse.json({ success: false, error: result.error || result.reason || "Failed to send" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
