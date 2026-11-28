import { getFirebaseAuth } from "./firebaseAdmin";
import { getUserByUid } from "./userModel";
import { isStaffRole } from "./permissions";

// Fast path for internal chat authorization.
//
// The generic helper in lib/apiAuth.js verifies the token AND loads the
// role document (two database round trips) because other modules need
// granular permission overrides. Internal chat only needs staff membership,
// which lives on the user document itself, so one lookup is enough. Security
// is unchanged: identity comes from the verified Firebase ID token, never
// from a client-supplied uid.
export async function requireInternalChatUser(request) {
  const header = request.headers?.get ? request.headers.get("authorization") : "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header || "").trim());
  if (!match) return { ok: false, status: 401, message: "Authentication required. Please sign in again." };

  const fbAuth = getFirebaseAuth();
  if (!fbAuth) return { ok: false, status: 503, message: "Authentication service is unavailable. Please try again." };

  let decoded;
  try {
    decoded = await fbAuth.verifyIdToken(match[1].trim());
  } catch {
    return { ok: false, status: 401, message: "Your session has expired. Please sign in again." };
  }
  if (!decoded?.uid) return { ok: false, status: 401, message: "Invalid authentication token." };

  const user = await getUserByUid(decoded.uid);
  if (!user) return { ok: false, status: 403, message: "Your account was not found." };
  if (!isStaffRole(user.role)) return { ok: false, status: 403, message: "Staff access required." };

  return { ok: true, uid: decoded.uid, user, role: user.role, token: decoded };
}
