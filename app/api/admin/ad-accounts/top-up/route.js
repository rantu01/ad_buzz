import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { updateSpendCap } from "@/lib/metaApiService";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

export async function POST(request) {
  try {
    const { accountId, amount, performedBy } = await request.json();
    const topUpAmount = Number(amount);

    if (!accountId || !topUpAmount || topUpAmount <= 0) {
      return NextResponse.json({ success: false, message: "accountId and a positive amount are required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const account = await db.collection("adAccounts").findOne({ _id: new ObjectId(accountId) });
    if (!account) {
      return NextResponse.json({ success: false, message: "Ad account not found" }, { status: 404 });
    }

    const localBudgetDollars = Number(account.spendCap || 0);
    const metaAccount = account.metaAccountId
      ? await db.collection("metaAdAccounts").findOne({ metaAccountId: account.metaAccountId })
      : null;
    const metaBudgetDollars = Number(metaAccount?.spendCap || 0);
    const previousBudgetDollars = metaBudgetDollars > 0 ? metaBudgetDollars : localBudgetDollars;
    const newBudgetDollars = previousBudgetDollars + topUpAmount;

    if (account.metaAccountId) {
      try {
        await updateSpendCap(account.metaAccountId, newBudgetDollars);
      } catch (metaErr) {
        return NextResponse.json({
          success: false,
          message: `Meta spend cap update failed: ${metaErr.message}. Top-up cancelled.`,
        }, { status: 500 });
      }
    }

    const adResult = await db.collection("adAccounts").findOneAndUpdate(
      { _id: new ObjectId(accountId) },
      {
        $set: { spendCap: newBudgetDollars, lastSyncedAt: new Date(), syncSource: "admin_topup", updatedAt: new Date() },
      },
      { returnDocument: "after" }
    );

    if (!adResult?.value) {
      return NextResponse.json({ success: false, message: "Failed to update ad account budget" }, { status: 500 });
    }

    if (account.metaAccountId) {
      await db.collection("metaAdAccounts").findOneAndUpdate(
        { metaAccountId: account.metaAccountId },
        { $set: { spendCap: newBudgetDollars, lastSyncedAt: new Date(), updatedAt: new Date() } }
      ).catch(() => {});
    }

    const performedByName = performedBy || "Admin";
    const logDoc = {
      uid: account.uid || "",
      email: performedByName,
      type: "ad_account_topup",
      amount: 0,
      balanceBefore: 0,
      balanceAfter: 0,
      description: `Admin top-up $${topUpAmount.toFixed(2)} to ad account "${account.name || account.accountId}"`,
      referenceId: accountId,
      referenceType: "ad_account",
      metadata: {
        accountId,
        accountName: account.name || "",
        previousBudget: previousBudgetDollars,
        newBudget: newBudgetDollars,
        topUpAmount,
        accountIdentifier: account.metaAccountId || account.accountId,
      },
      createdAt: new Date(),
    };
    await db.collection("balanceLogs").insertOne(logDoc);

    return NextResponse.json({
      success: true,
      message: `Successfully topped up $${topUpAmount.toFixed(2)}. Spend cap updated in Meta.`,
      accountBudget: newBudgetDollars,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Top-up failed" }, { status: 500 });
  }
}
