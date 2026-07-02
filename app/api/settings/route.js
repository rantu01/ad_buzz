import { NextResponse } from "next/server";
import { getSettings } from "@/lib/siteSettingsModel";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({
      success: true,
      settings: settings
        ? {
            siteName: settings.siteName || "Ad Buzz",
            primaryColor: settings.primaryColor || "#135B9A",
            secondaryColor: settings.secondaryColor || "#F48E2B",
            logo: settings.logo || null,
            dollarRate: settings.dollarRate || null,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
