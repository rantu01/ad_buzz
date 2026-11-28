import { NextResponse } from "next/server";
import { requireNoticeCustomer, unauth } from "@/lib/noticeAuth";
import { getCustomerNoticeById, getRecipientState, markNoticeRead } from "@/lib/noticeModel";
import { publishDueScheduledNotices } from "@/lib/noticeDelivery";

// Opening a notice marks it read for THIS customer only. The eligibility
// lookup is scoped to the verified uid before any state is written.
export async function GET(request, context) {
  try {
    const auth = await requireNoticeCustomer(request);
    if (!auth.ok) {
      const fail = unauth(auth);
      return NextResponse.json({ success: false, message: fail.message }, { status: fail.status });
    }
    await publishDueScheduledNotices();
    const params = context?.params ? await context.params : null;
    const id = params?.id || request.nextUrl.pathname.split("/").pop();
    const notice = await getCustomerNoticeById(auth.uid, id);
    if (!notice) {
      return NextResponse.json({ success: false, message: "Notice not found" }, { status: 404 });
    }
    await markNoticeRead(auth.uid, notice._id);
    return NextResponse.json({
      success: true,
      notice: { ...notice, recipient: await getRecipientState(auth.uid, notice._id) },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: process.env.NODE_ENV === "development" ? error.message : "Failed to load notice" },
      { status: 500 }
    );
  }
}
