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

export function getAuthErrorMessage(err) {
  const code = err?.code;
  if (code === "auth/user-not-found") return "No account found with this email.";
  if (code === "auth/wrong-password") return "Incorrect password.";
  if (code === "auth/invalid-credential") return "Invalid email or password.";
  if (code === "auth/invalid-email") return "Invalid email format.";
  return err?.message || "Login failed. Please try again.";
}
