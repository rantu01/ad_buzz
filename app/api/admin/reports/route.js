import { NextResponse } from "next/server";
import { getOverviewReport, getFinancialReport, getUserActivityReport, getAdSpendReport } from "@/lib/reportService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "overview";
    const period = searchParams.get("period") || "daily";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = searchParams.get("page");
    const limit = searchParams.get("limit");

    let data;
    switch (type) {
      case "overview":
        data = await getOverviewReport();
        break;
      case "financial":
        data = await getFinancialReport(period, startDate, endDate);
        break;
      case "users":
        data = await getUserActivityReport(startDate, endDate, { page, limit });
        break;
      case "ad-spend":
        data = await getAdSpendReport(startDate, endDate, { page, limit });
        break;
      default:
        return NextResponse.json({ success: false, message: "Invalid report type" }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
