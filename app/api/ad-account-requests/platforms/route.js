import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/apiAuth";
import { getActivePlatforms } from "@/lib/platformModel";

// Platforms come from the existing platform management collection in the
// shared database. Both panels use this endpoint so the dropdown and the
// admin filter can never drift apart.
export async function GET(request) {
  try {
    const auth = await requireCustomer(request);
    if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    const platforms = await getActivePlatforms();
    return NextResponse.json({ success: true, platforms });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to load platforms" }, { status: 500 });
  }
}
