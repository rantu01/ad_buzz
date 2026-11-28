import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { PERMISSIONS } from "@/lib/permissions";
import { validateNoticeInput } from "@/lib/noticeConstants";
import {
  createNotice,
  getNoticeById,
  getRecipientStats,
  getRecipientStatsForNotices,
  listNotices,
  serializeNotice,
  validateCustomerUids,
} from "@/lib/noticeModel";
import { notifyNoticePublished, notifyNoticeUpdated } from "@/lib/noticeDelivery";

function unauth(auth) {
  return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
}

function serverError(error, fallback) {
  return NextResponse.json(
    { success: false, message: process.env.NODE_ENV === "development" ? error.message : fallback },
    { status: 500 }
  );
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request, PERMISSIONS.VIEW_NOTICES);
    if (!auth.ok) return unauth(auth);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const notice = await getNoticeById(id);
      if (!notice) return NextResponse.json({ success: false, message: "Notice not found" }, { status: 404 });
      const [stats] = await Promise.all([getRecipientStats(notice)]);
      return NextResponse.json({
        success: true,
        notice: serializeNotice(notice, { withHistory: searchParams.get("history") === "1" }),
        stats,
      });
    }

    const result = await listNotices({
      status: searchParams.get("status"),
      type: searchParams.get("type"),
      audienceType: searchParams.get("audienceType"),
      search: searchParams.get("search"),
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
    });
    const stats = await getRecipientStatsForNotices(
      result.notices.map((n) => ({ _id: n._id, audienceType: n.audienceType, audienceCount: n.audienceCount, targetCustomerIds: n.targetCustomerIds }))
    );
    return NextResponse.json({ success: true, ...result, stats });
  } catch (error) {
    return serverError(error, "Failed to load notices");
  }
}

export async function POST(request) {
  try {
    const auth = await requireAdmin(request, PERMISSIONS.MANAGE_NOTICES);
    if (!auth.ok) return unauth(auth);

    const body = await request.json().catch(() => ({}));
    const check = validateNoticeInput(body);
    if (!check.ok) {
      return NextResponse.json({ success: false, message: Object.values(check.errors)[0], errors: check.errors }, { status: 400 });
    }

    let revisionOf = null;
    if (body.revisionOf) {
      const original = await getNoticeById(body.revisionOf);
      if (!original) {
        return NextResponse.json({ success: false, message: "Original notice for this revision was not found" }, { status: 400 });
      }
      revisionOf = String(original._id);
    }

    let targetDetails = [];
    let canonicalCustomerIds = [];
    if (check.value.audienceType === "individual") {
      const targets = await validateCustomerUids(check.value.targetCustomerIds);
      if (targets.invalid.length > 0 || targets.validUids.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: `${targets.invalid.length} selected customer(s) could not be resolved. Please refresh the customer list and try again.`,
            errors: { targetCustomerIds: "Invalid customer selection." },
            invalid: targets.invalid,
          },
          { status: 400 }
        );
      }
      canonicalCustomerIds = targets.validUids;
      targetDetails = targets.details.map(({ mongoId, uid, displayName, email, customId }) => ({
        mongoId, uid, displayName, email, customId,
      }));
    }

    const actor = {
      uid: auth.uid,
      name: auth.user.displayName || auth.user.email || "Admin",
      email: auth.user.email || "",
      role: auth.role,
    };

    const notice = await createNotice(
      { ...check.value, targetCustomerIds: canonicalCustomerIds, revisionOf, targetCustomerDetails: targetDetails },
      actor
    );

    if (notice.status === "published") {
      await notifyNoticePublished(notice, canonicalCustomerIds);
    } else if (notice.status === "scheduled") {
      await notifyNoticeUpdated(notice, "notice.scheduled");
    }

    return NextResponse.json({ success: true, notice, message: `Notice ${notice.status} successfully.` });
  } catch (error) {
    return serverError(error, "Failed to create notice");
  }
}
