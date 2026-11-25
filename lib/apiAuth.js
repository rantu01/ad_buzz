import { getFirebaseAuth } from "@/lib/firebaseAdmin";
import { getUserByUid } from "@/lib/userModel";
import { getStoredRole } from "@/lib/roleModel";
import { hasPermission, isStaffRole } from "@/lib/permissions";

// Server-side authentication for the Ad Account Request module.
//
// The caller's identity is derived from the verified Firebase ID token and
// the database user record — never from a client-supplied uid, email or role.
// All new request endpoints go through these helpers.

function fail(status, message) {
  return { ok: false, status, message };
}

export async function getAuthenticatedUser(request) {
  const header = request.headers?.get ? request.headers.get("authorization") : "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header || "").trim());
  if (!match) return fail(401, "Authentication required. Please sign in again.");

  const fbAuth = getFirebaseAuth();
  if (!fbAuth) return fail(503, "Authentication service is unavailable. Please try again.");

  let decoded;
  try {
    decoded = await fbAuth.verifyIdToken(match[1].trim());
  } catch {
    return fail(401, "Your session has expired. Please sign in again.");
  }
  if (!decoded?.uid) return fail(401, "Invalid authentication token.");

  const user = await getUserByUid(decoded.uid);
  if (!user) return fail(403, "Your account was not found.");

  const role = user.role || "customer";
  const storedRole = await getStoredRole(role);
  const overrides =
    storedRole && Array.isArray(storedRole.permissions)
      ? { [role]: storedRole.permissions }
      : undefined;

  return { ok: true, uid: decoded.uid, user, role, overrides, token: decoded };
}

export async function requireCustomer(request) {
  return getAuthenticatedUser(request);
}

// Staff-only authorization. Admin/director keep their built-in full access;
// every other staff role must have the requested permission saved in the
// shared roles collection (managed from /admin/roles).
export async function requireAdmin(request, permission) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.ok) return auth;
  if (!isStaffRole(auth.role)) return fail(403, "Admin access required.");
  if (auth.role !== "admin" && auth.role !== "director" && !hasPermission(auth.role, permission, auth.overrides)) {
    return fail(403, "You do not have permission to manage ad account requests.");
  }
  return auth;
}
