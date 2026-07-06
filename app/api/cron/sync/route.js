import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { syncAllAdAccounts } from "@/lib/metaApiService";
import { getMetaSettings, createSyncLog } from "@/lib/metaSettingsModel";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";
const CRON_SECRET = process.env.CRON_SECRET || "";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { type } = await request.json().catch(() => ({ type: "full" }));
    const startTime = Date.now();

    const settings = await getMetaSettings();
    if (!settings?.autoSyncEnabled) {
      return NextResponse.json({ success: false, message: "Auto sync is disabled in settings" });
    }

    const result = await syncAllAdAccounts();

    const duration = Date.now() - startTime;
    if (result.locked) {
      return NextResponse.json({ success: false, message: result.message || "Sync already running", locked: true });
    }
    return NextResponse.json({
      success: true,
      type,
      synced: result.synced || 0,
      errors: result.errors || 0,
      duration,
      message: result.message || `Synced ${result.synced || 0} accounts in ${duration}ms`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const settings = await getMetaSettings();
    const lastSyncLog = await db.collection("syncLogs")
      .find({})
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    const staleLocks = await db.collection("syncLocks").findOne({
      name: "meta_sync",
      locked: true,
    });

    return NextResponse.json({
      success: true,
      autoSyncEnabled: settings?.autoSyncEnabled || false,
      autoSpendCapUpdate: settings?.autoSpendCapUpdate || false,
      lastSync: lastSyncLog[0] || null,
      lockHeld: staleLocks?.locked || false,
      lockExpiresAt: staleLocks?.expiresAt || null,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
