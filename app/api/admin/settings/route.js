import { NextResponse } from "next/server";
import { getSettings, upsertSettings } from "@/lib/siteSettingsModel";

export async function GET() {
  try {
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
    const body = await request.json();
    const { siteName, primaryColor, secondaryColor, logo } = body;

    const result = await upsertSettings({ siteName, primaryColor, secondaryColor, logo });

    return NextResponse.json({ success: true, settings: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
