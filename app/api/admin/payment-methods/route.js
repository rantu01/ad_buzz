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
    const { type } = body;

    if (type === "mobile-banking") {
      if (!body.walletName || !body.walletNo || !body.accountType) {
        return NextResponse.json(
          { success: false, message: "Wallet Name, Wallet No, and Account Type are required." },
          { status: 400 }
        );
      }
    } else {
      if (!body.bankName || !body.accountName || !body.accountNumber || !body.branch) {
        return NextResponse.json(
          { success: false, message: "Bank Name, Account Name, Account Number, and Branch are required." },
          { status: 400 }
        );
      }
    }

    const method = await createPaymentMethod(body);
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Payment method ID is required." },
        { status: 400 }
      );
    }

    // Remove undefined fields so they don't overwrite with null
    Object.keys(updates).forEach((key) => {
      if (updates[key] === undefined) delete updates[key];
    });
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, message: "No fields to update." },
        { status: 400 }
      );
    }

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
