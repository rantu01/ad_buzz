import { NextResponse } from "next/server";
import { createDeposit, getDepositsByUid, getPendingDepositState } from "@/lib/depositModel";
import { createNotificationsForUids, createNotification } from "@/lib/notificationModel";
import { getStaffUids } from "@/lib/userModel";
import { emitToChannel, emitToUser } from "@/lib/sseManager";

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, email, amount, account, amountBDT, transactionRef, creditedUSD, paymentMethod, screenshot } = body;

    if (!uid || !email || !amount) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    const numAmount = Number(amount);
    if (numAmount <= 0) {
      return NextResponse.json(
        { success: false, message: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    const MIN_DEPOSIT_BDT = 1000;
    const numAmountBDT = Number(amountBDT);
    if (!Number.isFinite(numAmountBDT) || numAmountBDT < MIN_DEPOSIT_BDT) {
      return NextResponse.json(
        { success: false, message: `Minimum deposit amount is ${MIN_DEPOSIT_BDT} BDT` },
        { status: 400 }
      );
    }

    if (!screenshot || typeof screenshot !== "string" || !screenshot.startsWith("data:image")) {
      return NextResponse.json(
        { success: false, message: "Payment screenshot is required" },
        { status: 400 }
      );
    }

    const deposit = await createDeposit({
      uid, email, amount: numAmount,
      amountBDT, account, transactionRef, creditedUSD, paymentMethod,
      screenshotBase64: screenshot,
    });

    // Notify all connected staff in real time + persist a notification log
    // for every staff member and for the customer (Pending stage). Never
    // fail the deposit itself because the notification fan-out failed.
    try {
      const state = await getPendingDepositState();
      const amountLabel = `$${Number(deposit.creditedUSD || deposit.amount || 0).toFixed(2)}`;
      const staffUids = await getStaffUids();
      if (staffUids.length > 0) {
        const created = await createNotificationsForUids(staffUids, {
          role: "staff",
          type: "deposit_pending",
          title: `New deposit ${amountLabel} pending review`,
          body: `${deposit.email} submitted a deposit (${deposit.transactionRef || "no trx ref"}).`,
          link: "/admin/deposits",
          refType: "deposit",
          refId: String(deposit._id),
        });
        const byId = new Map(created.map((n) => [n.uid, n]));
        for (const staffUid of staffUids) {
          emitToUser(staffUid, "notify", { notification: byId.get(staffUid) || { title: "New deposit" } });
        }
      }
      const customerNotif = await createNotification({
        uid: deposit.uid,
        role: "customer",
        type: "deposit_pending",
        title: `Deposit ${amountLabel} submitted (Pending)`,
        body: "Your deposit request was received and is pending admin review.",
        link: "/user-dashboard/Payment-History",
        refType: "deposit",
        refId: String(deposit._id),
      });
      emitToUser(deposit.uid, "notify", { notification: customerNotif || { title: "Deposit submitted" } });
      emitToChannel("admin:deposits", "deposit.created", {
        deposit: {
          _id: String(deposit._id),
          email: deposit.email,
          amount: deposit.amount,
          amountBDT: deposit.amountBDT,
          creditedUSD: deposit.creditedUSD,
          transactionRef: deposit.transactionRef,
          createdAt: deposit.createdAt,
        },
        pending: state.pending,
      });
    } catch { /* notification is best-effort */ }

    return NextResponse.json({ success: true, deposit });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create deposit" },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json(
        { success: false, message: "UID required" },
        { status: 400 }
      );
    }

    const deposits = await getDepositsByUid(uid);

    return NextResponse.json({ success: true, deposits });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch deposits" },
      { status: 500 }
    );
  }
}
