import { NextResponse } from "next/server";
import { getAdAccountsByUid, createAdAccount } from "@/lib/adAccountModel";
import clientPromise from "@/lib/mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

function mapMetaStatus(accountStatus) {
  switch (accountStatus) {
    case 1: return "active";
    case 2: return "disabled";
    case 3:
    case 7:
    case 8:
    case 9: return "paused";
    case 100:
    case 101:
    case 202: return "disabled";
    default: return "unknown";
  }
}

function getMetaStatusLabel(accountStatus) {
  switch (accountStatus) {
    case 1: return "Active";
    case 2: return "Disabled";
    case 3: return "Inactive";
    case 7: return "Pending Risk Review";
    case 8: return "Pending Settlement";
    case 9: return "In Grace Period";
    case 100: return "Pending Closure";
    case 101: return "Closed";
    default: return "Unknown";
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    }

    const adAccounts = await getAdAccountsByUid(uid);

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const metaAccounts = await db.collection("metaAdAccounts").find({}).toArray();
    const metaByAccountId = {};
    for (const ma of metaAccounts) {
      metaByAccountId[ma.metaAccountId] = ma;
    }

    const enriched = adAccounts.map((acc) => {
      const meta = acc.metaAccountId ? metaByAccountId[acc.metaAccountId] : null;
      if (meta) {
        return {
          ...acc,
          metaAccountName: meta.name || acc.metaAccountName || acc.name,
          currency: meta.currency || acc.currency || "USD",
          metaStatus: meta.accountStatus,
          metaStatusLabel: getMetaStatusLabel(meta.accountStatus),
          status: mapMetaStatus(meta.accountStatus),
          metaBalance: meta.balance || 0,
          metaSpendCap: meta.spendCap || 0,
          metaAmountSpent: meta.amountSpent || 0,
          spent: typeof meta.amountSpent === "number" && meta.amountSpent > 0 ? meta.amountSpent : (typeof acc.spent === "number" && acc.spent > 0 ? acc.spent : 0),
        };
      }
      return {
        ...acc,
        metaStatus: null,
        metaStatusLabel: null,
        metaBalance: 0,
        metaSpendCap: 0,
        metaAmountSpent: 0,
      };
    });

    const totalBudget = enriched.reduce((s, a) => s + Number(a.spendCap || 0), 0);
    const totalSpent = enriched.reduce((s, a) => s + Number(a.spent || 0), 0);
    const activeCount = enriched.filter((a) => a.status === "active").length;

    return NextResponse.json({
      success: true,
      adAccounts: enriched,
      summary: {
        total: enriched.length,
        active: activeCount,
        totalBudget,
        totalSpent,
        remainingBudget: totalBudget - totalSpent,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch ad accounts" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, email, name, accountId, budget, status } = body;

    if (!uid) {
      return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    }

    const adAccount = await createAdAccount({ uid, email, name, accountId, budget, status });

    return NextResponse.json({ success: true, adAccount });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to create ad account" }, { status: 500 });
  }
}
