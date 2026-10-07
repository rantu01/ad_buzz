import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getUserByUid } from "@/lib/userModel";
import { ROLES, ROLE_LABELS } from "@/lib/permissions";
import { getRoleByKey } from "@/lib/roleModel";
import { deleteFirebaseAuthUser, updateFirebaseUserPassword } from "@/lib/firebaseAdmin";
import { createBalanceLog } from "@/lib/balanceLog";
import { initializeIndexes } from "@/lib/indexes";

const ALLOWED_ROLES = [ROLES.ADMIN, ROLES.KEY_MANAGER, ROLES.ACCOUNTS_MANAGER];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request) {
  try {
    await initializeIndexes();
    const searchParams = request ? new URL(request.url).searchParams : null;
    // Lightweight count for dashboard cards (no document download).
    if (searchParams && searchParams.get("countOnly") === "1") {
      const client = await clientPromise;
      const db = client.db(process.env.MONGODB_DB_NAME || "ad_buzz");
      const total = await db.collection("users").countDocuments({});
      return NextResponse.json({ success: true, total });
    }
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || "ad_buzz");

    const search = (searchParams?.get("search") || "").trim();
    const page = Number(searchParams?.get("page")) || 0;
    const limit = Number(searchParams?.get("limit")) || 0;

    const filter = {};
    if (search) {
      const q = escapeRegExp(search);
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { displayName: { $regex: q, $options: "i" } },
        { uid: { $regex: q, $options: "i" } },
      ];
    }

    // Paged shape when ?page=&limit= are given; legacy capped list otherwise.
    if (page > 0 && limit > 0) {
      const safePage = Math.max(1, Math.floor(page));
      const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
      const [total, users] = await Promise.all([
        db.collection("users").countDocuments(filter),
        db
          .collection("users")
          .find(filter)
          .project({ password: 0 })
          .sort({ createdAt: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .toArray(),
      ]);
      return NextResponse.json({
        success: true,
        users,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      });
    }

    const maxAll = Math.min(Math.max(limit || 200, 1), 2000);
    const users = await db
      .collection("users")
      .find(filter)
      .project({ password: 0 })
      .sort({ createdAt: -1 })
      .limit(maxAll)
      .toArray();

    return NextResponse.json({ success: true, users });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch users." },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const {
      uid,
      callerUid,
      role,
      availableBalance,
      accountStatus,
      displayName,
      dollarRate,
      groupName,
      password,
    } = body;

    if (!uid) {
      return NextResponse.json(
        { success: false, message: "uid is required." },
        { status: 400 }
      );
    }

    if (!callerUid) {
      return NextResponse.json(
        { success: false, message: "callerUid is required." },
        { status: 400 }
      );
    }

    const caller = await getUserByUid(callerUid);
    if (!caller) {
      return NextResponse.json(
        { success: false, message: "Caller not found." },
        { status: 403 }
      );
    }

    const callerRole = caller.role || "customer";
    const isAdmin = callerRole === ROLES.ADMIN;
    const isManager = ALLOWED_ROLES.includes(callerRole);

    if (!isAdmin && !isManager) {
      return NextResponse.json(
        { success: false, message: "You do not have permission to update users." },
        { status: 403 }
      );
    }

    const update = { updatedAt: new Date() };

    if (typeof role === "string" && role) {
      if (!isAdmin) {
        return NextResponse.json(
          { success: false, message: "Only admins can change user roles." },
          { status: 403 }
        );
      }
      // Role must exist in the managed `roles` collection (or be a known key),
      // so custom roles created from /admin/roles are assignable here.
      const roleDoc = await getRoleByKey(role);
      if (!roleDoc && !Object.values(ROLES).includes(role)) {
        return NextResponse.json(
          { success: false, message: `Unknown role "${role}". Create it from Roles & Permissions first.` },
          { status: 400 }
        );
      }
      update.role = role;
    }

    if (availableBalance !== undefined) {
      const numericBalance = Number(availableBalance);
      if (Number.isNaN(numericBalance)) {
        return NextResponse.json(
          { success: false, message: "availableBalance must be a number." },
          { status: 400 }
        );
      }
      update.availableBalance = numericBalance;
    }

    if (typeof accountStatus === "string" && accountStatus) {
      update.accountStatus = accountStatus;
      update.isFrozen = accountStatus === "frozen";
    }

    if (typeof displayName === "string") {
      update.displayName = displayName;
    }

    if (dollarRate !== undefined) {
      if (dollarRate === null || dollarRate === "") {
        update.dollarRate = null;
      } else {
        const numRate = Number(dollarRate);
        if (!Number.isNaN(numRate) && numRate > 0) {
          update.dollarRate = numRate;
        }
      }
    }

    if (typeof groupName === "string") {
      update.groupName = groupName;
    }

    if (typeof password === "string" && password.length > 0) {
      const passwordUpdated = await updateFirebaseUserPassword(uid, password);
      if (!passwordUpdated) {
        return NextResponse.json(
          { success: false, message: "Failed to update password in Firebase. Make sure the service account is properly configured." },
          { status: 500 }
        );
      }
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || "ad_buzz");

    let balanceBefore, userEmail;
    if (update.availableBalance !== undefined) {
      const currentUser = await db.collection("users").findOne(
        { uid },
        { projection: { availableBalance: 1, email: 1 } }
      );
      if (currentUser) {
        balanceBefore = Number(currentUser.availableBalance || 0);
        userEmail = currentUser.email;
      }
    }

    await db.collection("users").updateOne({ uid }, { $set: update });

    if (balanceBefore !== undefined) {
      const balanceAfter = Number(update.availableBalance);
      const callerName = caller?.displayName || caller?.email || "Admin";
      const callerRoleLabel = ROLE_LABELS[callerRole] || callerRole || "Admin";
      const actorLabel = `${callerRoleLabel} (${caller?.email || callerName})`;
      await createBalanceLog({
        uid,
        email: userEmail || "",
        type: "admin",
        amount: balanceAfter - balanceBefore,
        balanceBefore,
        balanceAfter,
        description: `${actorLabel} manually adjusted the balance from $${balanceBefore.toFixed(2)} to $${balanceAfter.toFixed(2)}`,
        referenceId: null,
        referenceType: null,
        metadata: { adjustedBy: callerUid, callerName, callerRole, callerEmail: caller?.email },
      });
    }

    return NextResponse.json({ success: true, message: "User updated successfully." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "User update failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { uid, callerUid } = body;

    if (!uid) {
      return NextResponse.json(
        { success: false, message: "uid is required." },
        { status: 400 }
      );
    }

    if (!callerUid) {
      return NextResponse.json(
        { success: false, message: "callerUid is required." },
        { status: 400 }
      );
    }

    const caller = await getUserByUid(callerUid);
    if (!caller) {
      return NextResponse.json(
        { success: false, message: "Caller not found." },
        { status: 403 }
      );
    }

    const callerRole = caller.role || "customer";
    if (callerRole !== ROLES.ADMIN) {
      return NextResponse.json(
        { success: false, message: "Only admins can delete users." },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || "ad_buzz");

    const deleted = await db.collection("users").deleteOne({ uid });

    if (deleted.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "User not found." },
        { status: 404 }
      );
    }

    const firebaseDeleted = await deleteFirebaseAuthUser(uid);
    if (!firebaseDeleted) {
      return NextResponse.json(
        { success: false, message: "User removed from database but failed to delete from Firebase Auth. Check server logs for details." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "User deleted successfully." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "User deletion failed." },
      { status: 500 }
    );
  }
}
