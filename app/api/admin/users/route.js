import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getUserByUid } from "@/lib/userModel";
import { ROLES } from "@/lib/permissions";
import { deleteFirebaseAuthUser } from "@/lib/firebaseAdmin";
import { createBalanceLog } from "@/lib/balanceLog";

const ALLOWED_ROLES = [ROLES.ADMIN, ROLES.KEY_MANAGER, ROLES.ACCOUNTS_MANAGER];

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || "ad_buzz");

    const users = await db
      .collection("users")
      .find({})
      .project({ password: 0 })
      .sort({ createdAt: -1 })
      .limit(200)
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
      await createBalanceLog({
        uid,
        email: userEmail || "",
        type: "admin",
        amount: balanceAfter - balanceBefore,
        balanceBefore,
        balanceAfter,
        description: `Admin adjusted balance from $${balanceBefore.toFixed(2)} to $${balanceAfter.toFixed(2)}`,
        referenceId: null,
        referenceType: null,
        metadata: { adjustedBy: callerUid },
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

    await deleteFirebaseAuthUser(uid);

    return NextResponse.json({ success: true, message: "User deleted successfully." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "User deletion failed." },
      { status: 500 }
    );
  }
}
