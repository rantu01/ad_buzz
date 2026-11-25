import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { PERMISSIONS } from "@/lib/permissions";
import { validateAdminAction, statusLabel } from "@/lib/adAccountRequestConstants";
import {
  getAllRequests,
  getRequestById,
  getRequestStats,
  updateRequestStatus,
} from "@/lib/adAccountRequestModel";
import { createNotification, createNotificationsForUids } from "@/lib/notificationModel";
import { getStaffUids } from "@/lib/userModel";
import { emitToChannel, emitToUser } from "@/lib/sseManager";

const CUSTOMER_LINK = "/user-dashboard/ad-account-request";
const ADMIN_LINK = "/admin/ad-account-requests";

function unauth(auth) {
  return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
}

function notificationFor(status) {
  if (status === "approved") return { type: "ad_account_request_approved", title: "Ad account request approved" };
  if (status === "rejected") return { type: "ad_account_request_rejected", title: "Ad account request rejected" };
  if (status === "more_info_required") return { type: "ad_account_request_more_info", title: "More information required" };
  return { type: "ad_account_request_status", title: `Request moved to ${statusLabel(status)}` };
}

// Persistent log + live push for the customer, the rest of staff, and the
// admin list channel. Delivery never fails the status change itself.
async function notifyStatusChange({ request, status, note, reason, reviewer }) {
  try {
    const meta = notificationFor(status);
    let body = `Your request for a ${request.platform} ad account "${request.adAccountName}" is now ${statusLabel(status)}.`;
    if (status === "rejected" && reason) body = `Your request was rejected. Reason: ${reason}`;
    else if (status === "more_info_required" && note) body = note;
    else if (note && status !== "rejected") body += ` Note: ${note}`;

    if (request.customerId) {
      const customerNotif = await createNotification({
        uid: request.customerId,
        role: "customer",
        type: meta.type,
        title: meta.title,
        body,
        link: CUSTOMER_LINK,
        refType: "ad_account_request",
        refId: String(request._id),
      });
      emitToUser(request.customerId, "notify", {
        notification: customerNotif || { title: meta.title, body, refType: "ad_account_request", refId: String(request._id) },
      });
    }

    const staffUids = await getStaffUids([reviewer.uid]);
    if (staffUids.length > 0) {
      const created = await createNotificationsForUids(staffUids, {
        role: "staff",
        type: meta.type,
        title: `${request.adAccountName}: ${statusLabel(status)}`,
        body: `${reviewer.name || "An admin"} updated an ad account request.`,
        link: ADMIN_LINK,
        refType: "ad_account_request",
        refId: String(request._id),
      });
      const byUid = new Map(created.map((n) => [String(n.uid), n]));
      for (const uid of staffUids) {
        emitToUser(uid, "notify", {
          notification: byUid.get(String(uid)) || { title: meta.title, refType: "ad_account_request", refId: String(request._id) },
        });
      }
    }

    emitToChannel("admin:ad-account-requests", "request.updated", {
      requestId: String(request._id),
      status,
    });
  } catch {
    // best-effort
  }
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, PERMISSIONS.VIEW_AD_ACCOUNT_REQUESTS);
    if (!auth.ok) return unauth(auth);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const found = await getRequestById(id);
      if (!found) return NextResponse.json({ success: false, message: "Request not found" }, { status: 404 });
      return NextResponse.json({ success: true, request: found });
    }

    const [result, stats] = await Promise.all([
      getAllRequests({
        status: searchParams.get("status"),
        platform: searchParams.get("platform"),
        customer: searchParams.get("customer"),
        accountName: searchParams.get("accountName"),
        dateFrom: searchParams.get("dateFrom"),
        dateTo: searchParams.get("dateTo"),
        page: searchParams.get("page"),
        limit: searchParams.get("limit"),
      }),
      getRequestStats(),
    ]);
    return NextResponse.json({ success: true, ...result, stats });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to load requests" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request, PERMISSIONS.MANAGE_AD_ACCOUNT_REQUESTS);
    if (!auth.ok) return unauth(auth);

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ success: false, message: "Request id is required" }, { status: 400 });

    const check = validateAdminAction(body);
    if (!check.ok) {
      return NextResponse.json({ success: false, message: Object.values(check.errors)[0], errors: check.errors }, { status: 400 });
    }

    const existing = await getRequestById(id);
    if (!existing) return NextResponse.json({ success: false, message: "Request not found" }, { status: 404 });

    const reviewer = {
      uid: auth.uid,
      name: auth.user.displayName || auth.user.email || "Admin",
      email: auth.user.email || "",
      role: auth.role,
    };
    const updated = await updateRequestStatus(id, { ...check.value, reviewer });
    if (!updated) return NextResponse.json({ success: false, message: "Unable to update request" }, { status: 500 });

    await notifyStatusChange({
      request: updated,
      status: updated.status,
      note: check.value.note,
      reason: check.value.reason,
      reviewer,
    });

    return NextResponse.json({
      success: true,
      request: updated,
      message: `Request marked as ${statusLabel(updated.status)}.`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || "Failed to update request" }, { status: 500 });
  }
}
