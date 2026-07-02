import { NextResponse } from "next/server";
import { getBankAccountsByUid, createBankAccount, deleteBankAccount } from "@/lib/bankAccountModel";
import { getPaymentMethodsByUid } from "@/lib/paymentMethodModel";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ success: false, message: "UID required" }, { status: 400 });
    }
    const [personalAccounts, assignedMethods] = await Promise.all([
      getBankAccountsByUid(uid),
      getPaymentMethodsByUid(uid),
    ]);
    const accounts = [...personalAccounts, ...assignedMethods];
    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, bankName, accountName, accountNumber, branch, referenceId, shortCode } = body;
    if (!uid || !bankName || !accountName || !accountNumber || !branch) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }
    const initials = bankName
      .split(" ")
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    const colorPalette = ["#1a5276", "#1e8449", "#2e86c1", "#a04000", "#7d3c98", "#c0392b", "#117a65", "#2471a3"];
    const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    const account = await createBankAccount({ uid, bankName, accountName, accountNumber, branch, referenceId, shortCode: shortCode || initials, color });
    return NextResponse.json({ success: true, account });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const uid = searchParams.get("uid");
    if (!id || !uid) {
      return NextResponse.json({ success: false, message: "id and uid required" }, { status: 400 });
    }
    await deleteBankAccount(id, uid);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
