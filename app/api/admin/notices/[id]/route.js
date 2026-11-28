import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { PERMISSIONS } from "@/lib/permissions";
import { validateNoticeInput, validateSafePublishedUpdate } from "@/lib/noticeConstants";
import {
  createNoticeDocuments,
  deleteNotice,
  getNoticeById,
  getRecipientStats,
  serializeNotice,
  updateNoticeFields,
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

function actorFor(auth) {
  return {
    uid: auth.uid,
    name: auth.user.displayName || auth.user.email || "Admin",
    email: auth.user.email || "",
    role: auth.role,
  };
}

function historySnapshot(notice, action) {
  return {
    action,
    snapshot: {
      title: notice.title,
      message: notice.message,
      type: notice.type,
      priority: notice.priority,
      audienceType: notice.audienceType,
      effectiveAt: notice.effectiveAt || null,
      expiresAt: notice.expiresAt || null,
      status: notice.status,
    },
  };
}

export async function GET(request, context) {
  try {
    const auth = await requireAdmin(request, PERMISSIONS.VIEW_NOTICES);
    if (!auth.ok) return unauth(auth);
    const { searchParams } = new URL(request.url);
    const params = context?.params ? await context.params : null;
    const notice = await getNoticeById(searchParams.get("id") || params?.id || request.nextUrl.pathname.split("/").pop());
    if (!notice) return NextResponse.json({ success: false, message: "Notice not found" }, { status: 404 });
    const stats = await getRecipientStats(notice);
    return NextResponse.json({
      success: true,
      notice: serializeNotice(notice, { withHistory: true }),
      stats,
    });
  } catch (error) {
    return serverError(error, "Failed to load notice");
  }
}

export async function PATCH(request, context) {
  try {
    const auth = await requireAdmin(request, PERMISSIONS.MANAGE_NOTICES);
    if (!auth.ok) return unauth(auth);

    const body = await request.json().catch(() => ({}));
    const params = context?.params ? await context.params : null;
    const id = body.id || params?.id || request.nextUrl.pathname.split("/").pop();
    const notice = await getNoticeById(id);
    if (!notice) return NextResponse.json({ success: false, message: "Notice not found" }, { status: 404 });

    const actor = actorFor(auth);
    const status = String(notice.status || "draft");
    if (status === "archived") {
      return NextResponse.json(
        { success: false, message: "Archived notices are read-only. Create a revision to publish updated content." },
        { status: 409 }
      );
    }

    const action = body.action ? String(body.action) : null;

    if (action === "publish") {
      if (status === "published") {
        return NextResponse.json({ success: false, message: "Notice is already published" }, { status: 400 });
      }
      if (notice.expiresAt && new Date(notice.expiresAt) <= new Date()) {
        return NextResponse.json({ success: false, message: "Extend the expiry date before publishing." }, { status: 400 });
      }
      const now = new Date();
      let audienceCount = notice.audienceCount || 0;
      let publishedIds = notice.targetCustomerIds || [];
      if (notice.audienceType === "individual") {
        const targets = await validateCustomerUids(notice.targetCustomerIds || []);
        if (targets.invalid.length > 0 || targets.validUids.length === 0) {
          return NextResponse.json(
            { success: false, message: `${targets.invalid.length} selected customer(s) could not be resolved. Edit the audience before publishing.` },
            { status: 400 }
          );
        }
        audienceCount = targets.validUids.length;
        publishedIds = targets.validUids;
        await createNoticeDocuments(notice._id, publishedIds);
      }
      await updateNoticeFields(
        notice._id,
        {
          status: "published",
          publishedAt: now,
          scheduledAt: null,
          archivedAt: null,
          audienceCount,
          targetCustomerIds: publishedIds,
          targetCustomerDetails: notice.targetCustomerDetails || [],
        },
        actor,
        historySnapshot(notice, "published")
      );
      const published = await getNoticeById(notice._id);
      await notifyNoticePublished(published, published.targetCustomerIds || []);
      return NextResponse.json({
        success: true,
        notice: serializeNotice(published, { withHistory: true }),
        message: "Notice published successfully.",
      });
    }

    if (action === "schedule") {
      if (status === "published") {
        return NextResponse.json({ success: false, message: "A published notice cannot be rescheduled. Create a revision instead." }, { status: 409 });
      }
      const scheduledAt = new Date(body.scheduledAt || notice.scheduledAt);
      if (!body.scheduledAt && !notice.scheduledAt) {
        return NextResponse.json({ success: false, message: "Choose a publish date and time." }, { status: 400 });
      }
      if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
        return NextResponse.json({ success: false, message: "Schedule time must be in the future." }, { status: 400 });
      }
      await updateNoticeFields(
        notice._id,
        { status: "scheduled", scheduledAt, publishedAt: null },
        actor,
        historySnapshot(notice, "scheduled")
      );
      const scheduled = await getNoticeById(notice._id);
      await notifyNoticeUpdated(scheduled, "notice.scheduled");
      return NextResponse.json({
        success: true,
        notice: serializeNotice(scheduled, { withHistory: true }),
        message: "Notice scheduled successfully.",
      });
    }

    if (action === "archive" || action === "unpublish") {
      await updateNoticeFields(
        notice._id,
        { status: "archived", archivedAt: new Date(), publishedAt: notice.publishedAt || null },
        actor,
        historySnapshot(notice, "archived")
      );
      const archived = await getNoticeById(notice._id);
      await notifyNoticeUpdated(archived, "notice.archived");
      return NextResponse.json({
        success: true,
        notice: serializeNotice(archived, { withHistory: true }),
        message: "Notice archived. Customers can no longer see it.",
      });
    }

    // Ordinary field edits.
    if (status === "published") {
      const check = validateSafePublishedUpdate(body, notice);
      if (!check.ok) {
        return NextResponse.json({ success: false, message: Object.values(check.errors)[0], errors: check.errors }, { status: 409 });
      }
      await updateNoticeFields(notice._id, check.value, actor, historySnapshot(notice, "safe_edit"));
      const updated = await getNoticeById(notice._id);
      await notifyNoticeUpdated(updated);
      return NextResponse.json({
        success: true,
        notice: serializeNotice(updated, { withHistory: true }),
        message: "Notice updated.",
      });
    }

    // Draft / scheduled notices can be fully edited.
    const merged = {
      title: body.title !== undefined ? body.title : notice.title,
      message: body.message !== undefined ? body.message : notice.message,
      type: body.type !== undefined ? body.type : notice.type,
      priority: body.priority !== undefined ? body.priority : notice.priority,
      audienceType: body.audienceType !== undefined ? body.audienceType : notice.audienceType,
      targetCustomerIds: body.targetCustomerIds !== undefined ? body.targetCustomerIds : notice.targetCustomerIds,
      changeKind: body.changeKind !== undefined ? body.changeKind : notice.changeKind,
      structuredChanges: body.structuredChanges !== undefined ? body.structuredChanges : notice.structuredChanges,
      effectiveAt: body.effectiveAt !== undefined ? body.effectiveAt : notice.effectiveAt,
      expiresAt: body.expiresAt !== undefined ? body.expiresAt : notice.expiresAt,
      scheduledAt: body.scheduledAt !== undefined ? body.scheduledAt : notice.scheduledAt,
      requireAcknowledgement:
        body.requireAcknowledgement !== undefined ? body.requireAcknowledgement : notice.requireAcknowledgement,
    };
    const nextStatus = ["draft", "scheduled"].includes(body.status) ? body.status : status;
    const check = validateNoticeInput({ ...merged, status: nextStatus });
    if (!check.ok) {
      return NextResponse.json({ success: false, message: Object.values(check.errors)[0], errors: check.errors }, { status: 400 });
    }

    let targetDetails = notice.targetCustomerDetails || [];
    let audienceCount = notice.audienceCount || 0;
    let canonicalIds = check.value.targetCustomerIds;
    if (check.value.audienceType === "individual") {
      const targets = await validateCustomerUids(check.value.targetCustomerIds);
      if (targets.invalid.length > 0 || targets.validUids.length === 0) {
        return NextResponse.json(
          { success: false, message: `${targets.invalid.length} selected customer(s) could not be resolved.` },
          { status: 400 }
        );
      }
      canonicalIds = targets.validUids;
      audienceCount = targets.validUids.length;
      targetDetails = targets.details.map(({ mongoId, uid, displayName, email, customId }) => ({
        mongoId, uid, displayName, email, customId,
      }));
    }

    await updateNoticeFields(
      notice._id,
      { ...check.value, targetCustomerIds: canonicalIds, audienceCount, targetCustomerDetails: targetDetails },
      actor,
      historySnapshot(notice, "edited")
    );
    const updated = await getNoticeById(notice._id);
    await notifyNoticeUpdated(updated);
    return NextResponse.json({
      success: true,
      notice: serializeNotice(updated, { withHistory: true }),
      message: "Notice updated.",
    });
  } catch (error) {
    return serverError(error, "Failed to update notice");
  }
}

export async function DELETE(request, context) {
  try {
    const auth = await requireAdmin(request, PERMISSIONS.MANAGE_NOTICES);
    if (!auth.ok) return unauth(auth);
    const params = context?.params ? await context.params : null;
    const id = params?.id || request.nextUrl.pathname.split("/").pop();
    const notice = await getNoticeById(id);
    if (!notice) return NextResponse.json({ success: false, message: "Notice not found" }, { status: 404 });

    const deleted = await deleteNotice(notice._id, actorFor(auth));
    if (!deleted) return NextResponse.json({ success: false, message: "Notice could not be deleted" }, { status: 500 });
    await notifyNoticeUpdated(notice, "notice.deleted");
    return NextResponse.json({
      success: true,
      mode: deleted.mode,
      message: deleted.mode === "hard"
        ? "Notice permanently deleted."
        : "Notice deleted. Customer acknowledgement history has been preserved.",
    });
  } catch (error) {
    return serverError(error, "Failed to delete notice");
  }
}
