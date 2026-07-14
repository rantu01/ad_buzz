import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json({ success: false, message: "accountId is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const ROLE_LABELS = {
      admin: "Admin",
      technical_manager: "Technical Manager",
      key_manager: "Key Manager",
      accounts_manager: "Accounts Manager",
      support_executive: "Support Executive",
      customer: "Customer",
    };

    const logs = await db
      .collection("balanceLogs")
      .find({
        type: "ad_account_topup",
        "metadata.accountId": accountId,
      })
      .sort({ createdAt: -1 })
      .toArray();

    const history = logs.map((log) => {
      const performedByRole = log.metadata?.performedByRole;
      const performedByEmail = log.metadata?.performedByEmail;
      const performedByName = log.metadata?.performedBy || log.email || "Unknown";
      const performedByRoleLabel = performedByRole ? (ROLE_LABELS[performedByRole] || performedByRole) : "Admin";
      const performedBy = `${performedByRoleLabel} (${performedByEmail || performedByName})`;

      return {
        _id: log._id,
        previousBudget: log.metadata?.previousBudget || 0,
        topUpAmount: log.metadata?.topUpAmount || 0,
        newBudget: log.metadata?.newBudget || 0,
        date: log.createdAt,
        transactionId: log._id.toString(),
        status: "Success",
        performedBy,
        description: log.description || "",
      };
    });

    return NextResponse.json({ success: true, history });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch history" }, { status: 500 });
  }
}
