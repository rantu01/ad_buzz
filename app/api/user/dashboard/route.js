import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json(
        { success: false, message: "uid is required." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || "ad_buzz");

    const user = await db.collection("users").findOne({ uid });

    return NextResponse.json({
      success: true,
      dashboard: {
        availableBalance: user?.availableBalance || 0,
        totalEarned: user?.totalEarned || 0,
        role: user?.role || "user",
        accountStatus: user?.accountStatus || "active",
        accountType: user?.accountType || "main",
        isDemoAccount: Boolean(user?.isDemoAccount || user?.accountType === "demo"),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load dashboard." },
      { status: 500 }
    );
  }
}
