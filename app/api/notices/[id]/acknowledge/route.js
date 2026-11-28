import { NextResponse } from "next/server";
import { requireNoticeCustomer, unauth } from "@/lib/noticeAuth";
import {
  acknowledgeNotice,
  getCustomerNoticeById,
  getCustomerNoticeCounts,
} from "@/lib/noticeModel";

// Idempotent acknowledgement. A repeat request never overwrites the original
// acknowledgement timestamp, and the notice eligibility is re-checked against
// the authenticated uid on every call.
export async function POST(request, context) {
  try {
    const auth = await requireNoticeCustomer(request);
    if (!auth.ok) {
      const fail = unauth(auth);
      return NextResponse.json({ success: false, message: fail.message }, { status: fail.status });
    }
    const params = context?.params ? await context.params : null;
    const id = params?.id || request.nextUrl.pathname.split("/")[3];
    const notice = await getCustomerNoticeById(auth.uid, id);
    if (!notice) return NextResponse.json({ success: false, message: "Notice not found" }, { status: 404 });

    const recipient = await acknowledgeNotice(auth.uid, notice._id);
    const counts = await getCustomerNoticeCounts(auth.uid);
    return NextResponse.json({ success: true, recipient, ...counts });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: process.env.NODE_ENV === "development" ? error.message : "Failed to acknowledge notice" },
      { status: 500 }
    );
  }
}
