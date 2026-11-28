import { requireCustomer } from "./apiAuth";

// Customer notice endpoints are strictly customer-only. Identity always comes
// from the verified Firebase token via requireCustomer — never from a query
// parameter or request body — so a customer cannot read or acknowledge a
// notice addressed to somebody else.
export async function requireNoticeCustomer(request) {
  const auth = await requireCustomer(request);
  if (!auth.ok) return auth;
  if (auth.role !== "customer") {
    return { ok: false, status: 403, message: "Notices are available to customers only." };
  }
  return auth;
}

export function unauth(auth) {
  return { success: false, message: auth.message, status: auth.status };
}
