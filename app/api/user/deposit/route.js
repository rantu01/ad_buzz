import { NextResponse } from "next/server";
import { createDeposit, getDepositsByUid, getPendingDepositState } from "@/lib/depositModel";
import { emitToChannel } from "@/lib/sseManager";

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

    const deposit = await createDeposit({
      uid, email, amount: numAmount,
      amountBDT, account, transactionRef, creditedUSD, paymentMethod,
      screenshotBase64: screenshot,
    });

    // Notify all connected staff in real time. Never fail the deposit
    // itself because the notification fan-out failed.
    try {
      const state = await getPendingDepositState();
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
