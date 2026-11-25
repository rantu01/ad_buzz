import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { requestPrioritySync } from "@/lib/autoMetaFetch";
import { checkManualThrottle } from "@/lib/metaApiService";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";
const REFRESH_THROTTLE_MS = 30000;

export async function POST(request) {
  try {
    const { uid, accountId } = await request.json();

    if (!uid || !accountId) {
      return NextResponse.json({ success: false, message: "uid and accountId are required" }, { status: 400 });
    }
    if (!ObjectId.isValid(accountId)) {
      return NextResponse.json({ success: false, message: "Invalid accountId" }, { status: 400 });
    }

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
    if (!account.metaAccountId) {
      return NextResponse.json({ success: false, message: "This ad account is not linked to Meta" }, { status: 400 });
    }

    const throttle = await checkManualThrottle(`manual:account:${account.metaAccountId}`, REFRESH_THROTTLE_MS);
    if (throttle.throttled) {
      return NextResponse.json({
        success: false,
        message: `Please wait ${throttle.waitSec}s before refreshing again.`,
        throttled: true,
      }, { status: 429 });
    }

    const queued = requestPrioritySync([account.metaAccountId]);
    return NextResponse.json({ success: true, message: "Refresh from Meta queued.", ...queued });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Refresh failed" }, { status: 500 });
  }
}
