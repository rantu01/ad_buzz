import { NextResponse } from "next/server";
import { getAllAdAccounts, createAdAccount, updateAdAccount, deleteAdAccount, getUnassignedAdAccounts } from "@/lib/adAccountModel";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { updateSpendCap } from "@/lib/metaApiService";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeUnassigned = searchParams.get("includeUnassigned") === "true";

    if (searchParams.get("unassigned") === "true") {
      const accounts = await getUnassignedAdAccounts();
      return NextResponse.json({ success: true, adAccounts: accounts });
    }

    let adAccounts = await getAllAdAccounts(includeUnassigned);

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const metaAccounts = await db.collection("metaAdAccounts").find({}).toArray();
    const metaByAccountId = {};
    for (const ma of metaAccounts) {
      metaByAccountId[ma.metaAccountId] = ma;
    }

    adAccounts = adAccounts.map((acc) => {
      const meta = acc.metaAccountId ? metaByAccountId[acc.metaAccountId] : null;
      return {
        ...acc,
        metaSpendCap: meta?.spendCap || acc.spendCap || 0,
        metaBalance: meta?.balance || 0,
        metaAmountSpent: meta?.amountSpent || 0,
        metaStatus: meta?.accountStatus || null,
        metaStatusLabel: meta?.accountStatus === 1 ? "Active" : meta?.accountStatus === 2 ? "Disabled" : meta?.accountStatus === 3 ? "Inactive" : null,
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
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "id required" }, { status: 400 });
    }

    await deleteAdAccount(id);
    return NextResponse.json({ success: true, message: "Deleted" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to delete" }, { status: 500 });
  }
}
