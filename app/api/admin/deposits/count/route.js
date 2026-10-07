import { NextResponse } from "next/server";
import { getPendingDepositState } from "@/lib/depositModel";

// Single source of truth for the deposits badge.
//   GET -> { pending, items }
// - `pending`: deposits currently in "pending" status (drives the badge;
//   0 / hidden when nothing awaits attention).
// - `items`: up to 20 most recent pending deposits for the dropdown.
export async function GET() {
  try {
    const state = await getPendingDepositState();
    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
