import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || "ad_buzz");
    const invitations = await db.collection("invitationCodes").find().sort({ createdAt: -1 }).limit(100).toArray();
    return NextResponse.json({ success: true, invitations });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch invitations." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { createdByUid, createdByEmail, createdByName } = body || {};

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || "ad_buzz");

    const code = Array.from({ length: 8 }, () =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]
    ).join("");

    const invitation = {
      code,
      isActive: true,
      createdByUid: createdByUid || null,
      createdByEmail: createdByEmail || null,
      createdByName: createdByName || null,
      usedByUid: null,
      usedByEmail: null,
      usedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("invitationCodes").insertOne(invitation);
    return NextResponse.json({ success: true, invitation });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to create invitation." }, { status: 500 });
  }
}
