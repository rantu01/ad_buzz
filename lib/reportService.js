import clientPromise from "./mongodb";
import { initializeIndexes } from "./indexes";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function getDb() {
  await initializeIndexes();
  const client = await clientPromise;
  return client.db(DB_NAME);
}

export async function getOverviewReport() {
  const db = await getDb();

  const [totalUsers, totalDeposits, depositsAgg, adAccountsAgg] = await Promise.all([
    db.collection("users").countDocuments({}),
    db.collection("deposits").countDocuments({}),
    db.collection("deposits").aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]).toArray(),
    db.collection("adAccounts").aggregate([
      { $group: { _id: null, totalBudget: { $sum: "$budget" }, totalSpent: { $sum: "$spent" }, count: { $sum: 1 } } },
    ]).toArray(),
  ]);

  const approvedDeposits = depositsAgg[0] || { total: 0, count: 0 };
  const adStats = adAccountsAgg[0] || { totalBudget: 0, totalSpent: 0, count: 0 };

  return {
    totalUsers,
    totalDeposits,
    approvedDepositsTotal: approvedDeposits.total,
    approvedDepositsCount: approvedDeposits.count,
    adAccounts: adStats.count,
    totalBudget: adStats.totalBudget,
    totalSpent: adStats.totalSpent,
    netRevenue: approvedDeposits.total || 0,
  };
}

export async function getFinancialReport(period = "daily", startDate, endDate) {
  const db = await getDb();
  const now = new Date();
  const end = endDate ? new Date(endDate) : new Date(now);
  const start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let dateFormat;
  if (period === "daily") dateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
  else if (period === "weekly") dateFormat = { $dateToString: { format: "%Y-W%V", date: "$createdAt" } };
  else dateFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };

  const [deposits] = await Promise.all([
    db.collection("deposits").aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: "approved" } },
      { $group: { _id: dateFormat, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
  ]);

  const dateMap = new Map();
  deposits.forEach((d) => {
    dateMap.set(d._id, { date: d._id, deposits: d.total, depositCount: d.count });
  });

  const rows = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const totalDeposits = rows.reduce((s, r) => s + r.deposits, 0);

  return { rows, summary: { totalDeposits, period } };
}

export async function getUserActivityReport(startDate, endDate, { page, limit } = {}) {
  const db = await getDb();
  const now = new Date();
  const end = endDate ? new Date(endDate) : new Date(now);
  const start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Server-side pagination (admin UI passes page+limit); the export path
  // omits them and keeps the full legacy shape.
  const usePaging = Number(page) > 0 && Number(limit) > 0;
  const safePage = usePaging ? Math.max(1, Math.floor(Number(page))) : 1;
  const safeLimit = usePaging ? Math.min(Math.max(1, Math.floor(Number(limit))), 200) : 0;

  const [totalUsers, users] = await Promise.all([
    db.collection("users").countDocuments({}),
    db.collection("users").find({}).project({ uid: 1, email: 1, displayName: 1, phoneNumber: 1, availableBalance: 1, totalEarned: 1, createdAt: 1 })
      .skip(usePaging ? (safePage - 1) * safeLimit : 0)
      .limit(safeLimit)
      .toArray(),
  ]);

  const uids = users.map((u) => u.uid);
  // Deposit stats only for the users on this page (was: whole collection).
  const [depositCounts] = await Promise.all([
    uids.length
      ? db.collection("deposits").aggregate([
          { $match: { uid: { $in: uids }, createdAt: { $gte: start, $lte: end } } },
          { $group: { _id: "$uid", count: { $sum: 1 }, total: { $sum: "$amount" } } },
        ]).toArray()
      : Promise.resolve([]),
  ]);

  const depositMap = new Map(depositCounts.map((d) => [d._id, d]));

  const rows = users.map((u) => ({
    uid: u.uid,
    email: u.email || "",
    displayName: u.displayName || "",
    phoneNumber: u.phoneNumber || "",
    balance: u.availableBalance || 0,
    totalEarned: u.totalEarned || 0,
    deposits: depositMap.get(u.uid)?.count || 0,
    depositTotal: depositMap.get(u.uid)?.total || 0,
    createdAt: u.createdAt,
  }));

  if (!usePaging) return { rows, total: users.length };
  return {
    rows,
    total: totalUsers,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(totalUsers / safeLimit)),
  };
}

export async function getAdSpendReport(startDate, endDate, { page, limit } = {}) {
  const db = await getDb();
  const now = new Date();
  const end = endDate ? new Date(endDate) : new Date(now);
  const start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const rangeFilter = {
    $or: [
      { lastSyncedAt: { $gte: start, $lte: end } },
      { createdAt: { $gte: start, $lte: end } },
    ],
  };

  // Server-side pagination (admin UI passes page+limit); the export path
  // omits them and keeps the full legacy shape. `lastInsights` blobs are
  // excluded from the list projection — neither the table nor the export
  // reads them.
  const usePaging = Number(page) > 0 && Number(limit) > 0;
  const safePage = usePaging ? Math.max(1, Math.floor(Number(page))) : 1;
  const safeLimit = usePaging ? Math.min(Math.max(1, Math.floor(Number(limit))), 200) : 0;

  const listProjection = { name: 1, metaAccountId: 1, accountId: 1, spendCap: 1, spent: 1, currency: 1, status: 1, uid: 1, email: 1, lastSyncedAt: 1 };

  // Summary always covers the full range (aggregation); only rows are paged.
  const [totalAccounts, summaryAgg, accounts] = await Promise.all([
    db.collection("adAccounts").countDocuments(rangeFilter),
    db.collection("adAccounts").aggregate([
      { $match: rangeFilter },
      { $group: { _id: null, totalBudget: { $sum: "$spendCap" }, totalSpent: { $sum: "$spent" } } },
    ]).toArray(),
    db.collection("adAccounts").find(rangeFilter).project(listProjection)
      .skip(usePaging ? (safePage - 1) * safeLimit : 0)
      .limit(safeLimit)
      .toArray(),
  ]);

  const agg = summaryAgg[0] || { totalBudget: 0, totalSpent: 0 };
  const totalBudget = Number(agg.totalBudget) || 0;
  const totalSpent = Number(agg.totalSpent) || 0;

  const result = {
    rows: accounts,
    summary: { totalAccounts, totalBudget, totalSpent, remainingBudget: totalBudget - totalSpent, utilization: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0 },
  };
  if (usePaging) {
    result.total = totalAccounts;
    result.page = safePage;
    result.limit = safeLimit;
    result.totalPages = Math.max(1, Math.ceil(totalAccounts / safeLimit));
  }
  return result;
}

export function generateCSV(rows, columns) {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((row) =>
    columns.map((c) => {
      const val = c.accessor ? c.accessor(row) : row[c.key];
      return `"${String(val ?? "").replace(/"/g, '""')}"`;
    }).join(",")
  ).join("\n");
  return `${header}\n${body}`;
}

export function generatePDFHtml(title, rows, columns, summary) {
  const headerRow = columns.map((c) => `<th style="text-align:left;padding:8px 12px;border-bottom:2px solid #E05305;color:#E05305;font-size:12px;font-weight:700;text-transform:uppercase;white-space:nowrap;">${c.label}</th>`).join("");

  const bodyRows = rows.map((row) => {
    const cells = columns.map((c) => {
      const val = c.accessor ? c.accessor(row) : row[c.key];
      return `<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;">${val ?? ""}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  const summaryHtml = summary ? `
    <div style="margin-bottom:20px;padding:16px;background:#fef5ee;border-radius:8px;border:1px solid #fed7aa;">
      ${Object.entries(summary).map(([k, v]) => `<span style="display:inline-block;margin-right:20px;font-size:13px;"><strong>${k}:</strong> ${v}</span>`).join("")}
    </div>
  ` : "";

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>${title}</title></head>
    <body style="font-family:Arial,sans-serif;padding:20px;color:#1e293b;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #E05305;">
        <h1 style="font-size:22px;margin:0;color:#E05305;">Ad Buzz</h1>
        <p style="font-size:14px;color:#64748b;margin:4px 0 0;">${title}</p>
        <p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">Generated: ${new Date().toLocaleString()}</p>
      </div>
      ${summaryHtml}
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows || '<tr><td colspan="99" style="text-align:center;padding:20px;color:#94a3b8;">No data available</td></tr>'}</tbody>
      </table>
      <div style="text-align:center;margin-top:30px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#94a3b8;">
        Ad Buzz — Confidential
      </div>
    </body>
    </html>
  `;
}
