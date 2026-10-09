import { NextResponse } from "next/server";
import { getAllDeposits, updateDepositStatus, getDepositById, getPendingDepositState } from "@/lib/depositModel";
import { creditUserBalance, getUserByUid, getStaffUids } from "@/lib/userModel";
import { createBalanceLog } from "@/lib/balanceLog";
import { getWhatsAppSettings } from "@/lib/whatsappSettingsModel";
import { sendDepositApproved, sendDepositRejected } from "@/lib/whatsappService";
import { ROLE_LABELS } from "@/lib/permissions";
import { createNotificationsForUids, createNotification } from "@/lib/notificationModel";
import { emitToChannel, emitToUser } from "@/lib/sseManager";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = searchParams.get("page");
    const limit = searchParams.get("limit");

    // Paged shape when ?page=&limit= are given (admin list);
    // legacy full-list shape otherwise (backward compatible).
    const result = await getAllDeposits(status, { page, limit });
    if (result && Array.isArray(result.deposits)) {
      return NextResponse.json({ success: true, ...result });
    }
    return NextResponse.json({ success: true, deposits: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch deposits" },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { depositId, status, approverUid, approverRole, approverEmail, rejectionReason, rejectionFile } = body;

    if (!depositId || !status) {
      return NextResponse.json(
        { success: false, message: "depositId and status required" },
        { status: 400 }
      );
    }

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { success: false, message: "Invalid status" },
        { status: 400 }
      );
    }

    const deposit = await getDepositById(depositId);
    if (!deposit) {
      return NextResponse.json(
        { success: false, message: "Deposit not found" },
        { status: 404 }
      );
    }

    const user = await getUserByUid(deposit.uid);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Deposit user not found" },
        { status: 404 }
      );
    }

    let updatedUser = user;

    if (status === "approved") {
      const balanceBefore = Number(user.availableBalance || 0);
      await creditUserBalance(deposit.uid, deposit.amount);
      updatedUser = await getUserByUid(deposit.uid);

      const approver = approverUid ? await getUserByUid(approverUid) : null;
      const effectiveRole = approverRole || approver?.role;
      const effectiveEmail = approverEmail || approver?.email || "";
      const approverRoleLabel = effectiveRole ? (ROLE_LABELS[effectiveRole] || effectiveRole) : "Unknown";
      const actorLabel = effectiveEmail ? `${approverRoleLabel} (${effectiveEmail})` : approverRoleLabel;

      await createBalanceLog({
        uid: deposit.uid,
        email: deposit.email || user.email,
        type: "deposit",
        amount: deposit.amount,
        balanceBefore,
        balanceAfter: Number(updatedUser?.availableBalance || 0),
        description: `${actorLabel} approved deposit: $${deposit.amount}`,
        referenceId: depositId,
        referenceType: "deposit",
        metadata: { approverUid, approverRole: effectiveRole, approverEmail: effectiveEmail },
      });
    }

    const result = await updateDepositStatus(depositId, status, approverUid, rejectionReason, rejectionFile);

    // Approval/rejection moves the deposit out of "pending": broadcast so
    // every staff badge/list drops it immediately (best-effort).
    try {
      const state = await getPendingDepositState();
      const amountLabel = `$${Number(deposit.creditedUSD ?? deposit.amount ?? 0).toFixed(2)}`;
      const approved = status === "approved";
      // Persistent logs + live push for the customer (Approved/Failed stage).
      const customerNotif = await createNotification({
        uid: deposit.uid,
        role: "customer",
        type: approved ? "deposit_approved" : "deposit_rejected",
        title: approved
          ? `Deposit ${amountLabel} approved`
          : `Deposit ${amountLabel} failed`,
        body: approved
          ? "Your deposit was approved and your balance has been updated."
          : `Your deposit was rejected${rejectionReason ? `: ${rejectionReason}` : "."}`,
        link: "/user-dashboard/Payment-History",
        refType: "deposit",
        refId: String(result?._id || depositId),
      });
      emitToUser(deposit.uid, "notify", { notification: customerNotif || { title: `Deposit ${status}` } });
      // Same event for the rest of the staff (persistent log + live push).
      const staffUids = await getStaffUids(approverUid ? [approverUid] : []);
      if (staffUids.length > 0) {
        const created = await createNotificationsForUids(staffUids, {
          role: "staff",
          type: approved ? "deposit_approved" : "deposit_rejected",
          title: approved
            ? `Deposit ${amountLabel} approved`
            : `Deposit ${amountLabel} rejected`,
          body: `${deposit.email}'s deposit was ${approved ? "approved" : "rejected"}.`,
          link: "/admin/deposits",
          refType: "deposit",
          refId: String(result?._id || depositId),
        });
        const byId = new Map(created.map((n) => [n.uid, n]));
        for (const staffUid of staffUids) {
          emitToUser(staffUid, "notify", { notification: byId.get(staffUid) || { title: `Deposit ${status}` } });
        }
      }
      emitToChannel("admin:deposits", "deposit.updated", {
        deposit: {
          _id: String(result?._id || depositId),
          email: result?.email || deposit.email,
          amount: result?.amount ?? deposit.amount,
          status,
          createdAt: result?.createdAt || deposit.createdAt,
        },
        pending: state.pending,
      });
    } catch { /* badge reconciles via polling fallback */ }

    const wsSettings = await getWhatsAppSettings();
    if (wsSettings?.enabled && user?.phoneNumber) {
      const name = user.displayName || user.email || "User";
      if (status === "approved" && wsSettings.notifyOnDeposit !== false) {
        sendDepositApproved(user.phoneNumber, name, deposit.amount, updatedUser?.availableBalance || 0).catch(() => {});
      } else if (status === "rejected" && wsSettings.notifyOnDeposit !== false) {
        sendDepositRejected(user.phoneNumber, name, deposit.amount, rejectionReason).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, deposit: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update deposit" },
      { status: 500 }
    );
  }
}
