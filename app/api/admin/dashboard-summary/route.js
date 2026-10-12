import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { initializeIndexes } from "@/lib/indexes";
import { startAutoMetaFetch } from "@/lib/autoMetaFetch";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

startAutoMetaFetch();

// $convert (not $toDouble) so a single malformed amount can't fail the
// whole dashboard aggregation.
const AMOUNT_EXPR = {
  $convert: { input: "$metadata.topUpAmount", to: "double", onError: 0, onNull: 0 },
};

function normalizeRole(raw) {
  const r = String(raw || "").trim().toLowerCase();
  if (!r) return "unknown";
  if (["customer", "client", "user"].includes(r)) return "client";
  if (r === "admin") return "admin";
  if (["key_manager", "keymanager", "key-manager"].includes(r)) return "keyManager";
  if (
    ["accounts_manager", "account_manager", "accountsmanager", "accounts-manager", "account-manager"].includes(r)
  )
    return "accountManager";
  return "other";
}

// TTL cache for the dashboard summary. The dashboard runs 10+ parallel
// aggregations over large collections — caching for 30s avoids re-scanning
// on every page navigation, search keystroke, and refetch.
const DASHBOARD_TTL_MS = 30_000;
let dashboardCache = null;
let dashboardCachedAt = 0;
let dashboardInflight = null;

export async function GET() {
  // Return fresh cached data immediately if available
  if (dashboardCache && Date.now() - dashboardCachedAt < DASHBOARD_TTL_MS) {
    return NextResponse.json(dashboardCache);
  }
  // Deduplicate concurrent requests
  if (dashboardInflight) return dashboardInflight;

  dashboardInflight = (async () => {
    try {
    await initializeIndexes();
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      totalClients,
      adAccountStatus,
      metaBalanceAgg,
      topupSummary,
      monthlyBuckets,
      lifetimeTop,
      lastMonthTop,
      depositsApprovedAgg,
      paymentMethodsCount,
      openTickets,
    ] = await Promise.all([
      // Box 1 — customers only (staff roles excluded).
      db.collection("users").countDocuments({ role: "customer" }),

      // Boxes 2–4 — ad account totals by local status.
      db
        .collection("adAccounts")
        .aggregate([
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),

      // Box 5 — sum of Meta balances for Active Meta accounts only
      // (Meta accountStatus 1 = Active; 2 = Disabled, 3 = Inactive).
      db
        .collection("metaAdAccounts")
        .aggregate([
          { $match: { accountStatus: 1 } },
          {
            $group: {
              _id: null,
              totalBalance: {
                $sum: { $convert: { input: "$balance", to: "double", onError: 0, onNull: 0 } },
              },
            },
          },
        ])
        .toArray(),

      // Boxes 6–12 — lifetime / current-month / last-month / by-role in one
      // pass over balanceLogs (single source of top-up truth).
      db
        .collection("balanceLogs")
        .aggregate([
          { $match: { type: "ad_account_topup" } },
          {
            $facet: {
              lifetime: [
                {
                  $group: {
                    _id: null,
                    amount: { $sum: AMOUNT_EXPR },
                    count: { $sum: 1 },
                  },
                },
              ],
              currentMonth: [
                { $match: { createdAt: { $gte: monthStart } } },
                {
                  $group: {
                    _id: null,
                    amount: { $sum: AMOUNT_EXPR },
                    count: { $sum: 1 },
                  },
                },
              ],
              lastMonth: [
                { $match: { createdAt: { $gte: lastMonthStart, $lt: monthStart } } },
                {
                  $group: {
                    _id: null,
                    amount: { $sum: AMOUNT_EXPR },
                    count: { $sum: 1 },
                  },
                },
              ],
              byRole: [
                {
                  $group: {
                    _id: "$metadata.performedByRole",
                    amount: { $sum: AMOUNT_EXPR },
                    count: { $sum: 1 },
                  },
                },
              ],
            },
          },
        ])
        .toArray(),

      // 12-month graph — same rolling-window logic as top-up-insights
      // (?breakdown=monthly&months=12).
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
              totalAmount: { $sum: AMOUNT_EXPR },
            },
          },
          { $sort: { "_id.y": 1, "_id.m": 1 } },
        ])
        .toArray(),

      // Left table — lifetime top 30 accounts by top-up amount.
      db
        .collection("balanceLogs")
        .aggregate([
          { $match: { type: "ad_account_topup" } },
          {
            $group: {
              _id: "$metadata.accountId",
              amount: { $sum: AMOUNT_EXPR },
              count: { $sum: 1 },
              name: { $first: "$metadata.accountName" },
              identifier: { $first: "$metadata.accountIdentifier" },
            },
          },
          { $sort: { amount: -1 } },
          { $limit: 30 },
        ])
        .toArray(),

      // Right table — top 30 accounts by last calendar month top-up.
      db
        .collection("balanceLogs")
        .aggregate([
          { $match: { type: "ad_account_topup", createdAt: { $gte: lastMonthStart, $lt: monthStart } } },
          {
            $group: {
              _id: "$metadata.accountId",
              amount: { $sum: AMOUNT_EXPR },
              count: { $sum: 1 },
              name: { $first: "$metadata.accountName" },
              identifier: { $first: "$metadata.accountIdentifier" },
            },
          },
          { $sort: { amount: -1 } },
          { $limit: 30 },
        ])
        .toArray(),

      // Box 14 — approved deposits (creditedUSD preferred, amount fallback).
      db
        .collection("deposits")
        .aggregate([
          { $match: { status: "approved" } },
          {
            $group: {
              _id: null,
              amount: {
                $sum: {
                  $convert: {
                    input: { $ifNull: ["$creditedUSD", "$amount"] },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),

      // Box 13.
      db.collection("paymentMethods").countDocuments({}),

      // Box 15 — every unresolved ticket (same meaning as the sidebar
      // badge / previous "Open Tickets" card: status != closed).
      db.collection("supportTickets").countDocuments({ status: { $ne: "closed" } }),
    ]);

    // ---- Ad account status counts ----
    let totalAdAccounts = 0;
    let activeAdAccounts = 0;
    let disabledAdAccounts = 0;
    for (const row of adAccountStatus || []) {
      const c = Number(row.count || 0);
      totalAdAccounts += c;
      if (row._id === "active") activeAdAccounts += c;
      if (row._id === "disabled") disabledAdAccounts += c;
    }

    const totalMetaBalance = metaBalanceAgg?.length ? Number(metaBalanceAgg[0].totalBalance || 0) : 0;

    // ---- Top-up summary ----
    const facet = topupSummary?.[0] || {};
    const lifetimeAmount = facet.lifetime?.length ? Number(facet.lifetime[0].amount || 0) : 0;
    const lifetimeCount = facet.lifetime?.length ? Number(facet.lifetime[0].count || 0) : 0;
    const currentMonthTopUp = facet.currentMonth?.length ? Number(facet.currentMonth[0].amount || 0) : 0;
    const currentMonthCount = facet.currentMonth?.length ? Number(facet.currentMonth[0].count || 0) : 0;
    const lastMonthTopUp = facet.lastMonth?.length ? Number(facet.lastMonth[0].amount || 0) : 0;
    const lastMonthCount = facet.lastMonth?.length ? Number(facet.lastMonth[0].count || 0) : 0;

    const byRole = {
      client: { amount: 0, count: 0 },
      admin: { amount: 0, count: 0 },
      keyManager: { amount: 0, count: 0 },
      accountManager: { amount: 0, count: 0 },
      other: { amount: 0, count: 0 },
    };
    for (const row of facet.byRole || []) {
      const bucket = normalizeRole(row._id);
      if (!byRole[bucket]) byRole[bucket] = { amount: 0, count: 0 };
      byRole[bucket].amount += Number(row.amount || 0);
      byRole[bucket].count += Number(row.count || 0);
    }
    const pct = (amount) => (lifetimeAmount > 0 ? (Number(amount || 0) / lifetimeAmount) * 100 : 0);
    for (const key of Object.keys(byRole)) {
      byRole[key].pct = pct(byRole[key].amount);
    }

    // ---- Rolling 12-month series (zero-filled) ----
    const byKey = {};
    for (const b of monthlyBuckets || []) {
      byKey[`${b._id.y}-${b._id.m}`] = b;
    }
    const monthly = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const b = byKey[`${y}-${m}`];
      monthly.push({
        key: `${y}-${String(m).padStart(2, "0")}`,
        year: y,
        month: m,
        total: b ? Number(b.total || 0) : 0,
        totalAmount: b ? Number(b.totalAmount || 0) : 0,
      });
    }

    // ---- Resolve account names for both top-30 lists ----
    const allIds = [...new Set([...lifetimeTop, ...lastMonthTop].map((r) => r._id).filter(Boolean))];
    const objectIds = [];
    for (const id of allIds) {
      try {
        objectIds.push(new ObjectId(id));
      } catch {
        // Non-ObjectId legacy keys stay unmatched; log-derived names still render.
      }
    }
    const accounts = objectIds.length
      ? await db
          .collection("adAccounts")
          .find({ _id: { $in: objectIds } })
          .project({ name: 1, metaAccountName: 1, metaAccountId: 1, accountId: 1 })
          .toArray()
      : [];
    const accountMap = {};
    for (const acc of accounts) {
      accountMap[String(acc._id)] = acc;
    }

    const mapTopRow = (row) => {
      const acc = row._id ? accountMap[String(row._id)] : null;
      const rawIdentifier = row.identifier || acc?.metaAccountId || acc?.accountId || row._id || "";
      return {
        accountId: row._id || "",
        name: row.name || acc?.metaAccountName || acc?.name || "Unknown account",
        identifier: String(rawIdentifier).replace(/^act_/, ""),
        amount: Number(row.amount || 0),
        count: Number(row.count || 0),
      };
    };

    const approvedDeposits = {
      amount: depositsApprovedAgg?.length ? Number(depositsApprovedAgg[0].amount || 0) : 0,
      count: depositsApprovedAgg?.length ? Number(depositsApprovedAgg[0].count || 0) : 0,
    };

    const result = {
      success: true,
      summary: {
        totalClients: Number(totalClients || 0),
        totalAdAccounts,
        activeAdAccounts,
        disabledAdAccounts,
        totalMetaBalance,
        lifetimeTopUp: lifetimeAmount,
        lifetimeTopUpCount: lifetimeCount,
        lastMonthTopUp,
        lastMonthTopUpCount: lastMonthCount,
        currentMonthTopUp,
        currentMonthTopUpCount: currentMonthCount,
        currentMonth: { year: now.getFullYear(), month: now.getMonth() + 1 },
        lastMonth: { year: lastMonthStart.getFullYear(), month: lastMonthStart.getMonth() + 1 },
        byRole,
        paymentMethodsCount: Number(paymentMethodsCount || 0),
        approvedDeposits,
        openTickets: Number(openTickets || 0),
      },
      monthly,
      topLifetime: lifetimeTop.map(mapTopRow),
      topLastMonth: lastMonthTop.map(mapTopRow),
    };

    dashboardCache = result;
    dashboardCachedAt = Date.now();
    return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { success: false, message: error.message || "Failed to load dashboard summary" },
        { status: 500 }
      );
    } finally {
      dashboardInflight = null;
    }
  })();

  return dashboardInflight;
}
