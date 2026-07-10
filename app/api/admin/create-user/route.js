import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getNextNumericId, formatUserId } from "@/lib/userModel";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password, displayName, role, groupName } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required." },
        { status: 400 }
      );
    }

    if (!groupName || !groupName.trim()) {
      return NextResponse.json(
        { success: false, message: "Group name is required." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    // Create user in Firebase Auth via REST API
    const signUpRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName || "",
          returnSecureToken: true,
        }),
      }
    );

    const signUpData = await signUpRes.json();

    if (!signUpRes.ok) {
      const errMsg = signUpData.error?.message || "Failed to create user in Firebase.";
      if (errMsg === "EMAIL_EXISTS") {
        return NextResponse.json(
          { success: false, message: "A user with this email already exists." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, message: errMsg },
        { status: 400 }
      );
    }

    const uid = signUpData.localId;

    // Create user document in MongoDB
    const numericId = await getNextNumericId();
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const now = new Date();

    const customId = formatUserId(numericId);

    const userDoc = {
      uid,
      numericId,
      customId,
      email: email.trim().toLowerCase(),
      displayName: displayName || "",
      phoneNumber: "",
      role: role || "customer",
      availableBalance: 0,
      totalEarned: 0,
      accountStatus: "active",
      isFrozen: false,
      groupName: groupName.trim(),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    await db.collection("users").insertOne(userDoc);

    return NextResponse.json({
      success: true,
      message: "User created successfully.",
      user: { uid, email, displayName: displayName || "", customId },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create user." },
      { status: 500 }
    );
  }
}
