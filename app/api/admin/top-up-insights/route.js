import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid") || "all";

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const query = { type: "ad_account_topup" };
    if (uid && uid !== "all") {
      query["metadata.accountId"] = { $exists: true };
    }

    const logs = await db
      .collection("balanceLogs")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    const accountIds = [...new Set(logs.map((l) => l.metadata?.accountId).filter(Boolean))].map(
      (id) => {
        try { return new ObjectId(id); } catch { return id; }
      }
    );

    const accounts = await db
      .collection("adAccounts")
      .find({ _id: { $in: accountIds } })
      .project({ name: 1, metaAccountName: 1, metaAccountId: 1, accountId: 1, uid: 1, email: 1 })
      .toArray();

    const accountMap = {};
    for (const acc of accounts) {
      accountMap[acc._id.toString()] = acc;
    }

    let data = logs.map((log) => {
      const acc = log.metadata?.accountId ? accountMap[log.metadata.accountId] : null;
      return {
        _id: log._id,
        createdAt: log.createdAt,
        type: log.type,
        amount: Number(log.metadata?.topUpAmount || 0),
        description: log.description || "",
        performedBy: log.email || "Unknown",
        userEmail: log.email || "",
        adAccountId: log.metadata?.accountIdentifier || acc?.metaAccountId || acc?.accountId || "",
        adAccountName: log.metadata?.accountName || acc?.metaAccountName || acc?.name || "",
        accountUid: acc?.uid || log.uid || "",
      };
    });

    if (uid && uid !== "all") {
      data = data.filter((item) => item.accountUid === uid);
    }

    return NextResponse.json({ success: true, insights: data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch insights" }, { status: 500 });
  }
}
