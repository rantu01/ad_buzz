import { NextResponse } from "next/server";
import { assignPaymentMethodToUsers } from "@/lib/paymentMethodModel";

export async function POST(request) {
  try {
    const body = await request.json();
    const { methodId, uids } = body;

    if (!methodId || !Array.isArray(uids)) {
      return NextResponse.json(
        { success: false, message: "methodId and uids array are required." },
        { status: 400 }
      );
    }

    await assignPaymentMethodToUsers(methodId, uids);
    return NextResponse.json({ success: true, message: "Payment method assigned to users." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to assign payment method." },
      { status: 500 }
    );
  }
}
