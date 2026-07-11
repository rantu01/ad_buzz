import { NextResponse } from "next/server";
import { getSettings, upsertSettings } from "@/lib/siteSettingsModel";
import { getUserByUid } from "@/lib/userModel";
import { ROLES } from "@/lib/permissions";

async function isAdmin(callerUid) {
  if (!callerUid) return false;
  const user = await getUserByUid(callerUid);
  return user?.role === ROLES.ADMIN;
}

async function requireAdmin(request) {
  const callerUid =
    request.headers.get("x-user-id") ||
    (await request.clone().json().catch(() => ({})))?.callerUid;

  if (!callerUid) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdmin(callerUid);
  if (!admin) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  return null;
}

export async function GET(request) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const settings = await getSettings();
    return NextResponse.json({
      success: true,
      settings: settings || null,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const body = await request.json();
    const { siteName, primaryColor, secondaryColor, logo, dollarRate } = body;

    const result = await upsertSettings({ siteName, primaryColor, secondaryColor, logo, dollarRate });

    return NextResponse.json({ success: true, settings: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
