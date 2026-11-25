import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/apiAuth";
import { validateRequestPayload, validateCustomerInfo } from "@/lib/adAccountRequestConstants";
import { findActivePlatform } from "@/lib/platformModel";
import {
  createRequest,
  getRequestsByCustomerId,
  getRequestById,
  addCustomerInfo,
} from "@/lib/adAccountRequestModel";
import { createNotificationsForUids } from "@/lib/notificationModel";
import { getStaffUids } from "@/lib/userModel";
import { emitToChannel, emitToUser } from "@/lib/sseManager";

function unauth(auth) {
  return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
}

async function notifyStaff({ type, title, body, requestId }) {
  try {
    const uids = await getStaffUids();
    if (uids.length === 0) return;
    const created = await createNotificationsForUids(uids, {
      role: "staff",
      type,
      title,
      body,
      link: "/admin/ad-account-requests",
      refType: "ad_account_request",
      refId: String(requestId),
    });
    const byUid = new Map(created.map((n) => [String(n.uid), n]));
    for (const uid of uids) {
      emitToUser(uid, "notify", { notification: byUid.get(String(uid)) || { title, body, refType: "ad_account_request", refId: String(requestId) } });
    }
    emitToChannel("admin:ad-account-requests", "request.updated", { requestId: String(requestId) });
  } catch {
    // Notifications are best-effort and must never fail the request itself.
  }
}

// Customer history. The uid used in the query is ALWAYS the verified session
// uid, so a customer can never read another customer's requests by changing
// a query parameter or an id.
export async function GET(request) {
  try {
    const auth = await requireCustomer(request);
    if (!auth.ok) return unauth(auth);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const found = await getRequestById(id, auth.uid);
      if (!found) return NextResponse.json({ success: false, message: "Request not found" }, { status: 404 });
      return NextResponse.json({ success: true, request: found });
    }

    const result = await getRequestsByCustomerId(auth.uid, {
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to load requests" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireCustomer(request);
    if (!auth.ok) return unauth(auth);

    const body = await request.json().catch(() => ({}));
    const check = validateRequestPayload(body);
    if (!check.ok) {
      return NextResponse.json({ success: false, message: "Please check the highlighted fields.", errors: check.errors }, { status: 400 });
    }

    // The platform must come from the existing platform management system.
    const platform = await findActivePlatform(body.platform);
    if (!platform) {
      return NextResponse.json(
        { success: false, message: "Please select a valid, active platform.", errors: { platform: "Select a platform from the list." } },
        { status: 400 }
      );
    }

    const created = await createRequest({
      customerId: auth.uid,
      customerName: auth.user.displayName || auth.user.email || "Customer",
      customerEmail: auth.user.email || "",
      ...check.value,
      platform: platform.name,
      platformId: platform.id,
    });

    await notifyStaff({
      type: "ad_account_request_submitted",
      title: `New ad account request: ${created.adAccountName}`,
      body: `${created.customerName || created.customerEmail} requested a ${created.platform} account with a $${Number(created.monthlyBudget).toFixed(2)} monthly budget.`,
      requestId: created._id,
    });

    return NextResponse.json({ success: true, request: created, message: "Request submitted successfully." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to submit request" }, { status: 500 });
  }
}

// A customer may only add information to a request that is explicitly asking
// for it. Approved/rejected requests are immutable from the customer side.
export async function PATCH(request) {
  try {
    const auth = await requireCustomer(request);
    if (!auth.ok) return unauth(auth);

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ success: false, message: "Request id is required" }, { status: 400 });

    const check = validateCustomerInfo(body);
    if (!check.ok) {
      return NextResponse.json({ success: false, message: check.errors.message, errors: check.errors }, { status: 400 });
    }

    const existing = await getRequestById(id, auth.uid);
    if (!existing) return NextResponse.json({ success: false, message: "Request not found" }, { status: 404 });
    if (existing.status !== "more_info_required") {
      return NextResponse.json({ success: false, message: "This request does not require additional information." }, { status: 400 });
    }

    const updated = await addCustomerInfo(id, auth.uid, check.value.message);
    if (!updated) return NextResponse.json({ success: false, message: "Unable to update this request." }, { status: 400 });

    await notifyStaff({
      type: "ad_account_request_info",
      title: `Information provided: ${updated.adAccountName}`,
      body: `${updated.customerName || updated.customerEmail} responded to your information request.`,
      requestId: updated._id,
    });

    return NextResponse.json({ success: true, request: updated, message: "Information submitted for review." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to update request" }, { status: 500 });
  }
}
