export async function syncUserProfile(user) {
  const res = await fetch("/api/auth/sync-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || "",
      phoneNumber: user.phoneNumber || "",
    }),
  });

  const data = await res.json();
  if (!data.success) {
    console.warn("User sync warning:", data.message);
  }

  return data;
}

export async function getDashboardPath(uid) {
  try {
    const res = await fetch(`/api/user/dashboard?uid=${encodeURIComponent(uid)}`);
    const data = await res.json();

    if (data.success && data.dashboard.role === "admin") {
      return "/admin";
    }
  } catch {
    // fall through to user dashboard
  }

  return "/user-dashboard";
}

export async function completeAuthFlow(user, onSuccess) {
  await syncUserProfile(user);
  const path = await getDashboardPath(user.uid);

  if (onSuccess) {
    onSuccess(path);
  } else {
    window.location.assign(path);
  }
}

export function getAuthErrorMessage(err) {
  const code = err?.code;
  if (code === "auth/user-not-found") return "No account found with this email.";
  if (code === "auth/wrong-password") return "Incorrect password.";
  if (code === "auth/invalid-credential") return "Invalid email or password.";
  if (code === "auth/invalid-email") return "Invalid email format.";
  if (code === "auth/email-already-in-use") return "This email is already registered. Please sign in.";
  if (code === "auth/weak-password") return "Password must be at least 6 characters.";
  if (code === "auth/popup-closed-by-user") return "Sign-in popup was closed. Please try again.";
  if (code === "auth/popup-blocked") return "Popup was blocked by your browser. Please allow popups and try again.";
  if (code === "auth/account-exists-with-different-credential") {
    return "An account already exists with this email using a different sign-in method.";
  }
  return err?.message || "Authentication failed. Please try again.";
}
