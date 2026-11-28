import { NextResponse } from "next/server";
import { requireNoticeCustomer, unauth } from "@/lib/noticeAuth";
import { getCustomerNoticeCounts } from "@/lib/noticeModel";
import { publishDueScheduledNotices } from "@/lib/noticeDelivery";

export async function GET(request) {
  try {
    const auth = await requireNoticeCustomer(request);
    if (!auth.ok) {
      const fail = unauth(auth);
      return NextResponse.json({ success: false, message: fail.message }, { status: fail.status });
    }
    await publishDueScheduledNotices();
    const counts = await getCustomerNoticeCounts(auth.uid);
    return NextResponse.json({ success: true, ...counts });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: process.env.NODE_ENV === "development" ? error.message : "Failed to load notice counts" },
      { status: 500 }
    );
  }
}
