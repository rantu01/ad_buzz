import { NextResponse } from "next/server";
import { requireNoticeCustomer, unauth } from "@/lib/noticeAuth";
import { getCustomerNotices } from "@/lib/noticeModel";
import { publishDueScheduledNotices } from "@/lib/noticeDelivery";

// All notices addressed to the signed-in customer. Recipient identity is
// derived from the verified token — no uid parameter is accepted here.
//   GET ?page=&limit=&unreadOnly=1&pendingAck=1&importantOnly=1
export async function GET(request) {
  try {
    const auth = await requireNoticeCustomer(request);
    if (!auth.ok) {
      const fail = unauth(auth);
      return NextResponse.json({ success: false, message: fail.message }, { status: fail.status });
    }
    await publishDueScheduledNotices();
    const { searchParams } = new URL(request.url);
    const result = await getCustomerNotices(auth.uid, {
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
      unreadOnly: searchParams.get("unreadOnly") === "1" || searchParams.get("unreadOnly") === "true",
      pendingAck: searchParams.get("pendingAck") === "1" || searchParams.get("pendingAck") === "true",
      importantOnly: searchParams.get("importantOnly") === "1" || searchParams.get("importantOnly") === "true",
      needsAction: searchParams.get("needsAction") === "1" || searchParams.get("needsAction") === "true",
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: process.env.NODE_ENV === "development" ? error.message : "Failed to load notices" },
      { status: 500 }
    );
  }
}
