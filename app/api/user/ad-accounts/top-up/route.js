import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { updateSpendCap } from "@/lib/metaApiService";
import { ROLE_LABELS } from "@/lib/permissions";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

export async function POST(request) {
  try {
    const { uid, accountId, amount } = await request.json();

    if (!uid || !accountId || !amount || Number(amount) <= 0) {
      return NextResponse.json({ success: false, message: "uid, accountId, and a positive amount are required" }, { status: 400 });
    }

    const topUpAmount = Number(amount);

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const user = await db.collection("users").findOne({ uid }, { projection: { password: 0 } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    if (Number(user.availableBalance) < topUpAmount) {
      return NextResponse.json({ success: false, message: "Insufficient wallet balance" }, { status: 400 });
    }

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
          message: `Meta spend cap update failed: ${metaErr.message}. Top-up cancelled. Ensure your Meta API token has 'ads_management' permission.`,
        }, { status: 500 });
      }
    }

    const newBalance = Number(user.availableBalance) - topUpAmount;

    const walletResult = await db.collection("users").findOneAndUpdate(
      { uid },
      {
        $set: { availableBalance: newBalance, updatedAt: new Date() },
      },
      { returnDocument: "after" }
    );

    const updatedUser = walletResult?.value ?? walletResult;
    if (!updatedUser) {
      return NextResponse.json({ success: false, message: "Failed to deduct wallet balance" }, { status: 500 });
    }

    const adResult = await db.collection("adAccounts").findOneAndUpdate(
      { _id: new ObjectId(accountId) },
      {
        $set: { spendCap: newBudgetDollars, lastSyncedAt: new Date(), syncSource: "local_topup", updatedAt: new Date() },
      },
      { returnDocument: "after" }
    );

    const updatedAccount = adResult?.value ?? adResult;
    if (!updatedAccount) {
      await db.collection("users").findOneAndUpdate(
        { uid },
        { $set: { availableBalance: Number(user.availableBalance), updatedAt: new Date() } }
      );
      return NextResponse.json({ success: false, message: "Failed to update ad account budget" }, { status: 500 });
    }

    if (account.metaAccountId) {
      await db.collection("metaAdAccounts").findOneAndUpdate(
        { metaAccountId: account.metaAccountId },
        { $set: { spendCap: newBudgetDollars, lastSyncedAt: new Date(), updatedAt: new Date() } }
      ).catch(() => {});
    }

    const performedRoleLabel = user.role ? (ROLE_LABELS[user.role] || user.role) : "Customer";
    const actorLabel = `${performedRoleLabel} (${user.email || uid})`;
    const logDoc = {
      uid,
      email: user.email || "",
      type: "ad_account_topup",
      amount: -topUpAmount,
      balanceBefore: Number(user.availableBalance),
      balanceAfter: Number(updatedUser.availableBalance),
      description: `${actorLabel} topped up $${topUpAmount.toFixed(2)} to ad account "${account.name || account.accountId}"`,
      referenceId: accountId,
      referenceType: "ad_account",
      metadata: {
        accountId,
        accountName: account.name || "",
        previousBudget: previousBudgetDollars,
        newBudget: newBudgetDollars,
        topUpAmount,
        accountIdentifier: account.metaAccountId || account.accountId,
        performedBy: user.displayName || user.email,
        performedByRole: user.role,
        performedByEmail: user.email,
      },
      createdAt: new Date(),
    };
    await db.collection("balanceLogs").insertOne(logDoc);

    return NextResponse.json({
      success: true,
      message: `Successfully topped up $${topUpAmount.toFixed(2)}. Spend cap updated in Meta.`,
      walletBalance: Number(updatedUser.availableBalance),
      accountBudget: newBudgetDollars,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Top-up failed" }, { status: 500 });
  }
}
