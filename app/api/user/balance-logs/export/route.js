import { NextResponse } from "next/server";
import { getBalanceLogs } from "@/lib/balanceLog";
import { generateCSV as generateCsv } from "@/lib/reportService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const type = searchParams.get("type") || "all";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!uid) {
      return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    }

    const { logs } = await getBalanceLogs({ uid, type, startDate, endDate, page: 1, limit: 10000 });

    const columns = [
      { label: "Date", accessor: (r) => new Date(r.createdAt).toLocaleString() },
      { label: "Type", key: "type" },
      { label: "Amount", accessor: (r) => `$${Number(r.amount).toFixed(2)}` },
      { label: "Balance Before", accessor: (r) => `$${Number(r.balanceBefore).toFixed(2)}` },
      { label: "Balance After", accessor: (r) => `$${Number(r.balanceAfter).toFixed(2)}` },
      { label: "Description", key: "description" },
    ];

    const csv = generateCsv(logs, columns);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="balance_history_${uid}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
