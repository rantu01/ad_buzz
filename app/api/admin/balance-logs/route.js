import { NextResponse } from "next/server";
import { getBalanceLogs } from "@/lib/balanceLog";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid") || "all";
    const type = searchParams.get("type") || "all";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const result = await getBalanceLogs({ uid, type, startDate, endDate, page, limit });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch balance logs" }, { status: 500 });
  }
}
