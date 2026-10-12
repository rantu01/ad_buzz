import { NextResponse } from "next/server";
import { getMetaSettings } from "@/lib/metaSettingsModel";
import { startAutoMetaFetch, runFullReconcile } from "@/lib/autoMetaFetch";
import { initializeIndexes } from "@/lib/indexes";

const CRON_SECRET = process.env.CRON_SECRET || "";

function isAuthorized(request) {
  if (!CRON_SECRET) return true;
  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

startAutoMetaFetch();
initializeIndexes();

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

    const result = await runFullReconcile("cron");
    if (result.skipped) {
      return NextResponse.json({ success: false, ...result }, { status: result.reason === "locked" ? 429 : 200 });
    }

    return NextResponse.json({
      success: true,
      count: result.accountCount || 0,
      created: result.created?.length || 0,
      updated: result.updated?.length || 0,
      deleted: result.deleted?.length || 0,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
