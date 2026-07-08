import { NextResponse } from "next/server";
import {
  getAllPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from "@/lib/paymentMethodModel";

export async function GET() {
  try {
    const methods = await getAllPaymentMethods();
    return NextResponse.json({ success: true, methods });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch payment methods." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { bankName, accountName, accountNumber, branch, referenceId, logo } = body;

    if (!bankName || !accountName || !accountNumber || !branch) {
      return NextResponse.json(
        { success: false, message: "Bank Name, Account Name, Account Number, and Branch are required." },
        { status: 400 }
      );
    }

    const method = await createPaymentMethod({ bankName, accountName, accountNumber, branch, referenceId, logo });
    return NextResponse.json({ success: true, method }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create payment method." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, bankName, accountName, accountNumber, branch, referenceId, logo } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Payment method ID is required." },
        { status: 400 }
      );
    }

    const updates = {};
    if (bankName !== undefined) updates.bankName = bankName;
    if (accountName !== undefined) updates.accountName = accountName;
    if (accountNumber !== undefined) updates.accountNumber = accountNumber;
    if (branch !== undefined) updates.branch = branch;
    if (referenceId !== undefined) updates.referenceId = referenceId;
    if (logo !== undefined) updates.logo = logo;

    const method = await updatePaymentMethod(id, updates);
    return NextResponse.json({ success: true, method });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update payment method." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Payment method ID is required." },
        { status: 400 }
      );
    }

    await deletePaymentMethod(id);
    return NextResponse.json({ success: true, message: "Payment method deleted." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete payment method." },
      { status: 500 }
    );
  }
}
