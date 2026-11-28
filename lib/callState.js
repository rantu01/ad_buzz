// Shared, dependency-free call lifecycle rules.
//
// Both chat systems persist call records in Mongo, but each route used to
// re-implement the same status math. Keeping the rules here makes the two
// systems behave identically on every device and gives us pure functions we
// can unit test without a database.

export const CALL_STATUSES = ["ringing", "calling", "accepted", "connected", "ended", "rejected", "missed", "cancelled"];
export const TERMINAL_CALL_STATUSES = ["ended", "rejected", "missed", "cancelled"];

export function normalizeCallStatus(status) {
  const value = String(status || "").toLowerCase();
  // "cancel" and "cancelled" are the same terminal state on the wire.
  if (value === "cancel") return "cancelled";
  return CALL_STATUSES.includes(value) ? value : "";
}

export function isTerminalCallStatus(status) {
  return TERMINAL_CALL_STATUSES.includes(normalizeCallStatus(status));
}

export function isRingingCallStatus(status) {
  const value = normalizeCallStatus(status);
  return value === "ringing" || value === "calling";
}

// A call may never move backwards out of a terminal state. This prevents a
// late "accepted" signal from a second device from reviving an ended call.
export function canUpdateCall(currentStatus, nextStatus) {
  const current = normalizeCallStatus(currentStatus);
  const next = normalizeCallStatus(nextStatus);
  if (!next) return false;
  if (!current) return true;
  if (isTerminalCallStatus(current)) return false;
  if (current === next) return false;
  if (current === "connected" && next === "accepted") return false;
  return true;
}

// Derive the authoritative status/timestamps/duration from the persisted call
// document. Client-supplied durations are only a hint: server timestamps win.
export function buildCallUpdates({ existing, status, duration, now = new Date() }) {
  const existingStatus = normalizeCallStatus(existing?.status) || "ringing";
  const requested = normalizeCallStatus(status);
  const result = {
    updates: {},
    effectiveStatus: existingStatus,
    newlyTerminal: false,
    finalDuration: 0,
    changed: false,
  };
  if (!requested || !canUpdateCall(existingStatus, requested)) return result;

  const accepted = normalizeCallStatus(requested) === "accepted" || normalizeCallStatus(requested) === "connected";
  const answeredAt = existing?.answeredAt || (accepted ? now : null);
  const terminal = isTerminalCallStatus(requested);
  const endedAt = terminal ? (existing?.endedAt || now) : null;

  const updates = {};
  if (accepted && !existing?.answeredAt) updates.answeredAt = now;
  if (terminal && !existing?.endedAt) updates.endedAt = now;
  // An unanswered call can never be reported as a completed call.
  let effectiveStatus = requested;
  if (requested === "ended" && !answeredAt) effectiveStatus = "missed";
  updates.status = effectiveStatus;

  let finalDuration = Number(duration);
  if (!Number.isFinite(finalDuration) || finalDuration < 0) finalDuration = 0;
  if (effectiveStatus === "missed" || effectiveStatus === "rejected" || effectiveStatus === "cancelled") {
    finalDuration = 0;
  } else if (effectiveStatus === "ended" || effectiveStatus === "connected") {
    if (answeredAt && endedAt) finalDuration = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(answeredAt).getTime()) / 1000));
    else finalDuration = 0;
  }
  updates.duration = finalDuration;

  return {
    updates,
    effectiveStatus,
    newlyTerminal: terminal && !isTerminalCallStatus(existingStatus),
    finalDuration,
    changed: true,
  };
}

// Returns true when an incoming ring on this device must stop immediately.
// Applies to terminal states, and to an accept/answer claimed by any device
// (including another device of the same user).
export function shouldStopRinging({ state, callId, activeCallId, incomingCallId, status }) {
  if (state !== "ringing") return false;
  if (activeCallId && activeCallId !== callId) return false;
  if (incomingCallId && incomingCallId !== callId) return false;
  return normalizeCallStatus(status) !== "ringing" && normalizeCallStatus(status) !== "calling";
}

// Stable key used to ignore retransmitted/duplicated signaling frames.
export function signalDedupeKey({ system, callId, type, fromUid, nonce }) {
  if (!callId || !type) return null;
  return [system || "", callId, type, fromUid || "", nonce || ""].join("|");
}
