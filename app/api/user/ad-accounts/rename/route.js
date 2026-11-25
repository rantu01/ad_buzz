import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { updateAdAccount } from "@/lib/adAccountModel";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

export async function PATCH(request) {
  try {
    const { uid, accountId, name } = await request.json();

    if (!uid || !accountId || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ success: false, message: "uid, accountId and a name are required" }, { status: 400 });
    }
    if (!ObjectId.isValid(accountId)) {
      return NextResponse.json({ success: false, message: "Invalid accountId" }, { status: 400 });
    }

    const trimmedName = name.trim().slice(0, 120);

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const account = await db.collection("adAccounts").findOne({
      _id: new ObjectId(accountId),
      uid,
      unassignedAt: null,
    });
    if (!account) {
      return NextResponse.json({ success: false, message: "Ad account not found" }, { status: 404 });
    }

    // displayName is the user-owned label; it takes precedence over the
    // name synced from Meta so a rename survives the next Meta refresh.
    const updated = await updateAdAccount(accountId, {
      name: trimmedName,
      metaAccountName: trimmedName,
      displayName: trimmedName,
    });

    return NextResponse.json({ success: true, message: "Ad account renamed.", adAccount: updated });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Rename failed" }, { status: 500 });
  }
}
