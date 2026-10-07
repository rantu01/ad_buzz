import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { initializeIndexes } from "@/lib/indexes";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

// Only the fields the insights mapping reads (row 129-144 below).
// balanceLogs docs carry balance snapshots + full metadata; shipping them
// for up to 10k rows made list reads megabytes.
const INSIGHT_LIST_PROJECTION = {
  createdAt: 1,
  type: 1,
  uid: 1,
  email: 1,
  description: 1,
  "metadata.accountId": 1,
  "metadata.topUpAmount": 1,
  "metadata.performedByRole": 1,
  "metadata.accountIdentifier": 1,
  "metadata.accountName": 1,
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid") || "all";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    // Monthly breakdown mode: single aggregation over a rolling window of the
    // last N calendar months (including the current month). Returns per-month
    // totals plus this-calendar-year totals. Existing callers are unaffected
    // (they don't pass `breakdown`).
    if (searchParams.get("breakdown") === "monthly") {
      await initializeIndexes();
      const months = Math.min(Math.max(Number(searchParams.get("months")) || 12, 1), 24);
      const now = new Date();
      const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

      const [buckets, lifetimeCount, lifetimeAgg] = await Promise.all([
        db
          .collection("balanceLogs")
          .aggregate([
            { $match: { type: "ad_account_topup", createdAt: { $gte: rangeStart } } },
            {
              $group: {
                _id: {
                  y: { $year: "$createdAt" },
                  m: { $month: "$createdAt" },
                },
                total: { $sum: 1 },
                totalAmount: { $sum: "$metadata.topUpAmount" },
              },
            },
            { $sort: { "_id.y": 1, "_id.m": 1 } },
          ])
          .toArray(),
        // Lifetime totals ride along so the page doesn't need a separate
        // full-collection fetch (previously a second request + 500 docs).
        db.collection("balanceLogs").countDocuments({ type: "ad_account_topup" }),
        db
          .collection("balanceLogs")
          .aggregate([
            { $match: { type: "ad_account_topup" } },
            { $group: { _id: null, totalAmount: { $sum: "$metadata.topUpAmount" } } },
          ])
          .toArray(),
      ]);

      const byKey = {};
      for (const b of buckets) {
        byKey[`${b._id.y}-${b._id.m}`] = b;
      }

      const monthly = [];
      for (let i = 0; i < months; i++) {
        const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const b = byKey[`${y}-${m}`];
        monthly.push({
          key: `${y}-${String(m).padStart(2, "0")}`,
          year: y,
          month: m,
          total: b ? b.total : 0,
          totalAmount: b ? Number(b.totalAmount || 0) : 0,
        });
      }

      let yearTotal = 0;
      let yearAmount = 0;
      for (const row of monthly) {
        if (row.year === now.getFullYear()) {
          yearTotal += row.total;
          yearAmount += row.totalAmount;
        }
      }

      return NextResponse.json({
        success: true,
        monthly,
        yearTotal,
        yearAmount,
        lifetimeTotal: lifetimeCount,
        lifetimeAmount: lifetimeAgg.length ? Number(lifetimeAgg[0].totalAmount || 0) : 0,
      });
    }

    await initializeIndexes();

    const query = { type: "ad_account_topup" };
    if (uid && uid !== "all") {
      query["metadata.accountId"] = { $exists: true };
    }
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lt = new Date(to);
    }

    const hasRange = Boolean(from || to);

    const [total, totalAgg, logs] = await Promise.all([
      db.collection("balanceLogs").countDocuments(query),
      db
        .collection("balanceLogs")
        .aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$metadata.topUpAmount" },
            },
          },
        ])
        .toArray(),
      db
        .collection("balanceLogs")
        .find(query)
        .project(INSIGHT_LIST_PROJECTION)
        .sort({ createdAt: -1 })
        .limit(hasRange ? 10000 : 500)
        .toArray(),
    ]);

    const totalAmount = totalAgg.length ? Number(totalAgg[0].totalAmount || 0) : 0;

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
        performedByRole: log.metadata?.performedByRole || "",
        adAccountId: log.metadata?.accountIdentifier || acc?.metaAccountId || acc?.accountId || "",
        adAccountName: log.metadata?.accountName || acc?.metaAccountName || acc?.name || "",
        accountUid: acc?.uid || log.uid || "",
      };
    });

    if (uid && uid !== "all") {
      data = data.filter((item) => item.accountUid === uid);
    }

    return NextResponse.json({ success: true, insights: data, total, totalAmount });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch insights" }, { status: 500 });
  }
}
