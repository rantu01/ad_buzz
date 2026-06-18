import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

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

    const previousBudget = Number(account.budget || 0);
    const newBudget = previousBudget + topUpAmount;

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
        $set: { budget: newBudget, updatedAt: new Date() },
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

    const logDoc = {
      uid,
      email: user.email || "",
      type: "ad_account_topup",
      amount: -topUpAmount,
      balanceBefore: Number(user.availableBalance),
      balanceAfter: Number(updatedUser.availableBalance),
      description: `Top-up $${topUpAmount.toFixed(2)} to ad account "${account.name || account.accountId}"`,
      referenceId: accountId,
      referenceType: "ad_account",
      metadata: {
        accountId,
        accountName: account.name || "",
        previousBudget,
        newBudget,
        topUpAmount,
        accountIdentifier: account.metaAccountId || account.accountId,
      },
      createdAt: new Date(),
    };
    await db.collection("balanceLogs").insertOne(logDoc);

    return NextResponse.json({
      success: true,
      message: `Successfully topped up $${topUpAmount.toFixed(2)}`,
      walletBalance: Number(updatedUser.availableBalance),
      accountBudget: newBudget,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Top-up failed" }, { status: 500 });
  }
}
