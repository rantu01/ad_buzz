import getFirebaseAdmin from "./firebaseAdmin";
import { getStorage } from "firebase-admin/storage";

export function getStorageBucket() {
  const app = getFirebaseAdmin();
  if (!app) return null;
  try {
    const storage = getStorage(app);
    return storage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  } catch (e) {
    console.error("getStorageBucket failed:", e?.message || e);
    return null;
  }
}

export const TICKET_ATTACHMENT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

export const TICKET_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;