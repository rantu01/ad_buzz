import { NextResponse } from "next/server";
import { getAllAdAccounts, createAdAccount, updateAdAccount, deleteAdAccount, deleteAllAdAccounts, deleteUnassignedAdAccounts, getUnassignedAdAccounts } from "@/lib/adAccountModel";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { updateSpendCap } from "@/lib/metaApiService";
import { META_AD_ACCOUNT_PROJECTION } from "@/lib/projections";
import { initializeIndexes } from "@/lib/indexes";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    // Lightweight count for dashboard cards (skips joins entirely).
    if (searchParams.get("countOnly") === "1") {
      const client = await clientPromise;
      const db = client.db(DB_NAME);
      const total = await db.collection("adAccounts").countDocuments({});
      return NextResponse.json({ success: true, total });
    }
    await initializeIndexes();
    const includeUnassigned = searchParams.get("includeUnassigned") === "true";

    if (searchParams.get("unassigned") === "true") {
      const accounts = await getUnassignedAdAccounts();
      return NextResponse.json({ success: true, adAccounts: accounts });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Single aggregation serves Topup This Month + Topup Last Month + Last
    // Topup Date per ad account (calendar months, no N+1 per-account
    // queries). $convert (not $toDouble) so a malformed amount can't fail
    // the whole page. Only successful top-ups are logged with
    // type "ad_account_topup", so failed/pending are never counted.
    const amountExpr = { $convert: { input: "$metadata.topUpAmount", to: "double", onError: 0, onNull: 0 } };
    const topUpPipeline = [
      { $match: { type: "ad_account_topup" } },
      {
        $facet: {
          // Calendar-month buckets need only the last two months.
          monthly: [
            { $match: { createdAt: { $gte: lastMonthStart } } },
            {
              $group: {
                _id: "$metadata.accountId",
                thisMonth: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart] }, amountExpr, 0] } },
                lastMonth: {
                  $sum: {
                    $cond: [
                      { $and: [{ $gte: ["$createdAt", lastMonthStart] }, { $lt: ["$createdAt", monthStart] }] },
                      amountExpr,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          // Most-recent topup is over ALL history (an account whose last
          // topup was 3 months ago must still show that date, not N/A).
          latest: [
            { $group: { _id: "$metadata.accountId", lastTopupDate: { $max: "$createdAt" } } },
          ],
        },
      },
    ];

    // The three reads are independent: run them concurrently so TTFB is
    // the slowest query, not the sum of all three. Topup stats are
    // best-effort — a stats failure resolves to null and must not take
    // down the whole page.
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const [allAccounts, metaAccounts, facetOut] = await Promise.all([
      getAllAdAccounts(includeUnassigned),
      db.collection("metaAdAccounts").find(
        {},
        { projection: META_AD_ACCOUNT_PROJECTION }
      ).toArray(),
      db.collection("balanceLogs").aggregate(topUpPipeline).toArray().then(
        (r) => r,
        (statsErr) => {
          console.error("[admin/ad-accounts] Topup stats aggregation failed, continuing without stats:", statsErr.message);
          return null;
        }
      ),
    ]);
    const monthlyResults = facetOut?.[0]?.monthly || [];
    const latestResults = facetOut?.[0]?.latest || [];

    let adAccounts = allAccounts;
    const metaByAccountId = {};
    for (const ma of metaAccounts) {
      metaByAccountId[ma.metaAccountId] = ma;
    }

    const topUpMap = {};
    for (const r of monthlyResults) {
      if (r._id) {
        topUpMap[r._id] = {
          thisMonth: Number(r.thisMonth || 0),
          lastMonth: Number(r.lastMonth || 0),
          lastTopupDate: null,
        };
      }
    }
    for (const r of latestResults) {
      if (r._id) {
        if (!topUpMap[r._id]) topUpMap[r._id] = { thisMonth: 0, lastMonth: 0, lastTopupDate: null };
        topUpMap[r._id].lastTopupDate = r.lastTopupDate ? new Date(r.lastTopupDate).toISOString() : null;
      }
    }

    adAccounts = adAccounts.map((acc) => {
      const meta = acc.metaAccountId ? metaByAccountId[acc.metaAccountId] : null;
      const stats = topUpMap[acc._id.toString()] || { thisMonth: 0, lastMonth: 0, lastTopupDate: null };
      // Remaining Balance keeps its existing business meaning:
      // Meta spend_cap minus Meta amount_spent. null when Meta state is
      // missing (rendered as N/A, never confused with $0).
      const hasMetaSpend = meta != null && typeof meta.spendCap === "number";
      const hasMetaSpent = meta != null && typeof meta.amountSpent === "number";
      const remainingBalance = hasMetaSpend && hasMetaSpent ? meta.spendCap - meta.amountSpent : null;
      return {
        ...acc,
        metaSpendCap: meta?.spendCap ?? acc.spendCap ?? 0,
        metaBalance: meta?.balance ?? null,
        metaAmountSpent: meta?.amountSpent ?? null,
        metaStatus: meta?.accountStatus ?? null,
        metaStatusLabel: meta?.accountStatus === 1 ? "Active" : meta?.accountStatus === 2 ? "Disabled" : meta?.accountStatus === 3 ? "Inactive" : null,
        remainingBalance,
        remainingBalanceSource: remainingBalance == null ? "unavailable" : "meta",
        // Prepaid "Funds" (Meta Payment & Billing → Funds via
        // funding_source_details). null = unavailable (permission / field
        // absent / non-prepay) — the UI renders N/A, never $0.
        // Prefer the latest Meta snapshot, but retain a successfully synced
        // ad-account value if the two collections are briefly out of sync.
        prepaidBalance: meta?.prepaidBalance ?? acc.prepaidBalance ?? null,
        prepaidBalanceStatus: meta?.prepaidBalanceStatus || acc.prepaidBalanceStatus || "unavailable",
        isPrepayAccount: meta?.isPrepayAccount ?? acc.isPrepayAccount ?? null,
        topupThisMonth: stats.thisMonth,
        topupLastMonth: stats.lastMonth,
        lastTopupDate: stats.lastTopupDate,
        currentMonthTopUp: stats.thisMonth,
      };
    });

    return NextResponse.json({ success: true, adAccounts });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, email, name, accountId, budget, status, metaAccountId, metaAccountName, currency, spendCap, assignedBy } = body;

    const adAccount = await createAdAccount({
      uid: uid || "",
      email: email || "",
      name,
      accountId,
      budget,
      status,
      metaAccountId,
      metaAccountName,
      currency,
      spendCap,
      assignedBy,
    });

    return NextResponse.json({ success: true, adAccount });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to create" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { _id, ...updates } = body;

    if (!_id) {
      return NextResponse.json({ success: false, message: "_id required" }, { status: 400 });
    }

    if (updates.budget !== undefined) {
      updates.spendCap = Number(updates.budget);
      delete updates.budget;
    }

    if (updates.spendCap !== undefined && updates.spendCap !== null) {
      const client = await clientPromise;
      const db = client.db(DB_NAME);
      const account = await db.collection("adAccounts").findOne({ _id: new ObjectId(_id) });
      if (account?.metaAccountId) {
        try {
          await updateSpendCap(account.metaAccountId, Number(updates.spendCap));
        } catch (metaErr) {
          return NextResponse.json({ success: false, message: `Meta update failed: ${metaErr.message}` }, { status: 500 });
        }
        await db.collection("metaAdAccounts").findOneAndUpdate(
          { metaAccountId: account.metaAccountId },
          { $set: { spendCap: Number(updates.spendCap), updatedAt: new Date() } }
        ).catch(() => {});
      }
      updates.lastSyncedAt = new Date();
      updates.syncSource = "admin_manual";
    }

    const result = await updateAdAccount(_id, updates);
    return NextResponse.json({ success: true, adAccount: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("all") === "true") {
      await deleteAllAdAccounts();
      return NextResponse.json({ success: true, message: "All ad accounts deleted" });
    }

    if (searchParams.get("unassigned") === "true") {
      await deleteUnassignedAdAccounts();
      return NextResponse.json({ success: true, message: "Unassigned ad accounts deleted" });
    }

    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, message: "id, ?all=true, or ?unassigned=true required" }, { status: 400 });
    }

    await deleteAdAccount(id);
    return NextResponse.json({ success: true, message: "Deleted" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to delete" }, { status: 500 });
  }
}
