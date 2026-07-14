let admin;
let auth;

try {
  admin = require("firebase-admin");
  auth = require("firebase-admin/auth");
} catch (e) {
  console.error("Failed to load firebase-admin:", e?.message || e);
  admin = null;
}

function normalizePrivateKey(rawKey) {
  if (!rawKey) return rawKey;
  let key = String(rawKey).trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  return key;
}

export default function getFirebaseAdmin() {
  if (!admin) return null;
  if (admin.getApps().length > 0) return admin.getApp();

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, "base64").toString("utf-8")
      );
      return admin.initializeApp({
        credential: admin.cert(serviceAccount),
      });
    }

    if (
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ) {
      return admin.initializeApp({
        credential: admin.cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
        }),
      });
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }

    return null;
  } catch (err) {
    console.error("getFirebaseAdmin initialization failed:", err?.message || err);
    return null;
  }
}

export function getFirebaseAuth() {
  const app = getFirebaseAdmin();
  if (!app || !auth) return null;
  try {
    return auth.getAuth(app);
  } catch (err) {
    console.error("getFirebaseAuth failed:", err?.message || err);
    return null;
  }
}

export async function deleteFirebaseAuthUser(uid) {
  const fbAuth = getFirebaseAuth();
  if (!fbAuth) {
    console.error("deleteFirebaseAuthUser: Firebase Auth not available.");
    return false;
  }
  try {
    await fbAuth.deleteUser(uid);
    return true;
  } catch (err) {
    console.error("deleteFirebaseAuthUser failed:", err.message || err);
    return false;
  }
}

export async function updateFirebaseUserPassword(uid, newPassword) {
  const fbAuth = getFirebaseAuth();
  if (!fbAuth) {
    console.error("updateFirebaseUserPassword: Firebase Auth not available.");
    return false;
  }
  try {
    await fbAuth.updateUser(uid, { password: newPassword });
    return true;
  } catch (err) {
    console.error("updateFirebaseUserPassword failed:", err.message || err);
    return false;
  }
}
