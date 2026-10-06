import { NextResponse } from "next/server";
import { syncAllAdAccounts, checkManualThrottle } from "@/lib/metaApiService";
import { getMetaAdAccounts, getSyncLogs, createSyncLog } from "@/lib/metaSettingsModel";
import { runFullReconcile, requestPrioritySync } from "@/lib/autoMetaFetch";

// Manual refresh throttle window: collapses rapid clicks (one or many
// clients) into a single Meta sync. Client keeps its own 5-min guard too.
const MANUAL_THROTTLE_MS = 60000;

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "fetch-accounts") {
      const throttle = await checkManualThrottle("manual:fetch-accounts", MANUAL_THROTTLE_MS);
      if (throttle.throttled) {
        return NextResponse.json({ success: false, message: `Please wait ${throttle.waitSec}s before refreshing again.`, throttled: true }, { status: 429 });
      }
      // Single shared incremental reconcile (not one Meta call per client).
      const result = await runFullReconcile("manual");
      if (result?.skipped) {
        return NextResponse.json({ success: false, message: result.message || `Sync skipped (${result.reason}).`, ...result }, { status: result.reason === "locked" ? 429 : 200 });
      }
      const accounts = await getMetaAdAccounts();
      await createSyncLog({ type: "info", message: `Manual fetch: reconciled ${accounts.length} ad accounts from Meta BM` });
      return NextResponse.json({ success: true, accounts, count: accounts.length, created: result.created?.length || 0, updated: result.updated?.length || 0, deleted: result.deleted?.length || 0 });
    }

    if (action === "refresh-account") {
      const { metaAccountId } = body;
      if (!metaAccountId) {
        return NextResponse.json({ success: false, message: "metaAccountId required" }, { status: 400 });
      }
      const throttle = await checkManualThrottle(`manual:account:${metaAccountId}`, 30000);
      if (throttle.throttled) {
        return NextResponse.json({ success: false, message: `Please wait ${throttle.waitSec}s before refreshing again.`, throttled: true }, { status: 429 });
      }
      const queued = requestPrioritySync([metaAccountId]);
      return NextResponse.json({ success: true, ...queued });
    }

    if (action === "sync-spend") {
      const throttle = await checkManualThrottle("manual:sync-spend", MANUAL_THROTTLE_MS);
      if (throttle.throttled) {
        return NextResponse.json({ success: false, message: `Please wait ${throttle.waitSec}s before syncing again.`, throttled: true }, { status: 429 });
      }
      const result = await syncAllAdAccounts();
      if (result.locked) {
        return NextResponse.json({ success: false, message: "Sync already running. Please wait.", locked: true }, { status: 429 });
      }
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "test-connection") {
      const { testConnection } = await import("@/lib/metaApiService");
      const result = await testConnection();
      return NextResponse.json({ success: result.success, message: result.message, connectionTest: result });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "meta-accounts") {
      const accounts = await getMetaAdAccounts();
      return NextResponse.json({ success: true, accounts });
    }

    if (type === "logs") {
      const logs = await getSyncLogs();
      return NextResponse.json({ success: true, logs });
    }

    return NextResponse.json({ success: false, message: "Invalid type parameter" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
