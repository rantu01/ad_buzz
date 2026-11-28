import { NextResponse } from "next/server";
import { requireNoticeCustomer, unauth } from "@/lib/noticeAuth";
import { getCustomerNoticeById, getCustomerNoticeCounts, getRecipientState, markNoticeRead } from "@/lib/noticeModel";

export async function POST(request, context) {
  try {
    const auth = await requireNoticeCustomer(request);
    if (!auth.ok) {
      const fail = unauth(auth);
      return NextResponse.json({ success: false, message: fail.message }, { status: fail.status });
    }
    const params = context?.params ? await context.params : null;
    const id = params?.id || request.nextUrl.pathname.split("/")[3];
    // Eligibility is checked against the authenticated uid before any write.
    const notice = await getCustomerNoticeById(auth.uid, id);
    if (!notice) return NextResponse.json({ success: false, message: "Notice not found" }, { status: 404 });

    await markNoticeRead(auth.uid, notice._id);
    const [recipient, counts] = await Promise.all([
      getRecipientState(auth.uid, notice._id),
      getCustomerNoticeCounts(auth.uid),
    ]);
    return NextResponse.json({ success: true, recipient, ...counts });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: process.env.NODE_ENV === "development" ? error.message : "Failed to mark notice as read" },
      { status: 500 }
    );
  }
}
