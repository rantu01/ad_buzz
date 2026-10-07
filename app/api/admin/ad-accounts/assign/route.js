import { NextResponse } from "next/server";
import { assignAdAccount, unassignAdAccount } from "@/lib/adAccountModel";
import { getUserByUid } from "@/lib/userModel";

export async function POST(request) {
  try {
    const body = await request.json();
    const { accountIds, uid, assignedBy } = body;

    if (!accountIds || !uid || !assignedBy) {
      return NextResponse.json({ success: false, message: "accountIds, uid, and assignedBy are required" }, { status: 400 });
    }

    const user = await getUserByUid(uid);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found with this UID" }, { status: 404 });
    }

    const ids = Array.isArray(accountIds) ? accountIds : [accountIds];

    // Independent per-account writes: run concurrently instead of serially
    // (was: 2 sequential DB ops × N accounts). Same results/errors shape.
    const settled = await Promise.all(ids.map(async (accountId) => {
      try {
        const result = await assignAdAccount(accountId, uid, user.email || "", assignedBy);
        return { ok: true, result };
      } catch (err) {
        return { ok: false, accountId, message: err.message };
      }
    }));

    const results = settled.filter((s) => s.ok).map((s) => s.result);
    const errors = settled.filter((s) => !s.ok).map((s) => ({ accountId: s.accountId, message: s.message }));

    return NextResponse.json({
      success: true,
      assigned: results.length,
      errors: errors.length,
      adAccounts: results,
      errorDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json({ success: false, message: "accountId required" }, { status: 400 });
    }

    const result = await unassignAdAccount(accountId);
    return NextResponse.json({ success: true, adAccount: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
