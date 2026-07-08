let admin;

try {
  admin = require("firebase-admin");
} catch {
  admin = null;
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
        credential: admin.credential.cert(serviceAccount),
      });
    }

    if (
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ) {
      return admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(
            /\\n/g,
            "\n"
          ),
        }),
      });
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }

    return null;
  } catch {
    return null;
  }
}

export async function deleteFirebaseAuthUser(uid) {
  const app = getFirebaseAdmin();
  if (!app) return false;
  try {
    await app.auth().deleteUser(uid);
    return true;
  } catch {
    return false;
  }
}
