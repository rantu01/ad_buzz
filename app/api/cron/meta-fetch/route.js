import { NextResponse } from "next/server";
import { fetchAdAccountsFromBM } from "@/lib/metaApiService";
import { saveMetaAdAccounts, createSyncLog, getMetaSettings } from "@/lib/metaSettingsModel";
import { startAutoMetaFetch } from "@/lib/autoMetaFetch";

const CRON_SECRET = process.env.CRON_SECRET || "";

function isAuthorized(request) {
  if (!CRON_SECRET) return true;
  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

startAutoMetaFetch();

export async function POST(request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const settings = await getMetaSettings();
    if (!settings?.accessToken || !settings?.businessManagerId) {
      return NextResponse.json({
        success: false,
        message: "Meta API not configured. Please configure in Meta API Settings first.",
      });
    }

    const accounts = await fetchAdAccountsFromBM();
    await saveMetaAdAccounts(accounts);
    await createSyncLog({
      type: "info",
      message: `[Auto-fetch] Fetched ${accounts.length} ad accounts from Meta BM`,
    });

    return NextResponse.json({ success: true, count: accounts.length });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
