import { getFirebaseAuth } from "@/lib/firebaseAdmin";
import { getUserByUid } from "@/lib/chatModel";

// Customer-support chat still has legacy callers that identify themselves with
// a `uid` field (the <img>/<audio> subresources use the same convention). New
// clients send a Firebase ID token. Prefer the verified token whenever one is
// present and fall back to the legacy lookup only when it is absent, so adding
// auth never breaks an existing chat session.

export async function resolveChatCaller(request, claimedUid) {
  const header = request.headers?.get ? request.headers.get("authorization") : "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header || "").trim());
  if (match) {
    const fbAuth = getFirebaseAuth();
    if (!fbAuth) return { ok: false, status: 503, message: "Authentication service is unavailable." };
    let decoded;
    try {
      decoded = await fbAuth.verifyIdToken(match[1].trim());
    } catch {
      return { ok: false, status: 401, message: "Your session has expired." };
    }
    const user = decoded?.uid ? await getUserByUid(decoded.uid) : null;
    if (!user) return { ok: false, status: 403, message: "Account not found." };
    return { ok: true, uid: decoded.uid, user, verified: true };
  }
  const uid = claimedUid ? String(claimedUid) : "";
  if (!uid) return { ok: false, status: 400, message: "uid required" };
  const user = await getUserByUid(uid);
  if (!user) return { ok: false, status: 404, message: "User not found" };
  return { ok: true, uid, user, verified: false };
}
