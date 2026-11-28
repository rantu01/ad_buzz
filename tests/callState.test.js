import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCallStatus,
  isTerminalCallStatus,
  canUpdateCall,
  buildCallUpdates,
  shouldStopRinging,
  signalDedupeKey,
} from "../lib/callState.js";

test("call statuses are normalized, including cancel/cancelled", () => {
  assert.equal(normalizeCallStatus("RINGING"), "ringing");
  assert.equal(normalizeCallStatus("cancel"), "cancelled");
  assert.equal(normalizeCallStatus("nonsense"), "");
  assert.equal(isTerminalCallStatus("rejected"), true);
  assert.equal(isTerminalCallStatus("accepted"), false);
});

test("terminal calls cannot be revived and accepted never follows connected", () => {
  assert.equal(canUpdateCall("ended", "accepted"), false);
  assert.equal(canUpdateCall("ringing", "accepted"), true);
  assert.equal(canUpdateCall("connected", "accepted"), false);
  assert.equal(canUpdateCall("ringing", "ringing"), false);
});

test("buildCallUpdates derives authoritative duration from server timestamps", () => {
  const started = new Date("2026-01-01T10:00:00Z");
  const ended = new Date("2026-01-01T10:00:42Z");
  const accepted = buildCallUpdates({ existing: { status: "ringing" }, status: "accepted", now: started });
  assert.equal(accepted.updates.status, "accepted");
  assert.equal(accepted.updates.answeredAt, started);
  assert.equal(accepted.newlyTerminal, false);

  const update = buildCallUpdates({
    existing: { status: "connected", answeredAt: started },
    status: "ended",
    duration: 999,
    now: ended,
  });
  assert.equal(update.updates.status, "ended");
  assert.equal(update.finalDuration, 42);
  assert.equal(update.newlyTerminal, true);
});

test("an unanswered call cannot be reported as completed", () => {
  const result = buildCallUpdates({ existing: { status: "ringing" }, status: "ended", duration: 10 });
  assert.equal(result.effectiveStatus, "missed");
  assert.equal(result.finalDuration, 0);
});

test("ringtone stops for another device's accept and for terminal status", () => {
  const base = {
    state: "ringing",
    callId: "call_1",
    activeCallId: null,
    incomingCallId: "call_1",
  };
  assert.equal(shouldStopRinging({ ...base, status: "accepted" }), true);
  assert.equal(shouldStopRinging({ ...base, status: "rejected" }), true);
  assert.equal(shouldStopRinging({ ...base, status: "ringing" }), false);
  assert.equal(shouldStopRinging({ ...base, incomingCallId: "call_2", status: "ended" }), false);
});

test("signal dedupe keys are stable per call, type and device", () => {
  const a = signalDedupeKey({ system: "internal", callId: "c1", type: "ice", fromUid: "u1", nonce: "candidate-1" });
  const b = signalDedupeKey({ system: "internal", callId: "c1", type: "ice", fromUid: "u1", nonce: "candidate-1" });
  const c = signalDedupeKey({ system: "internal", callId: "c1", type: "ice", fromUid: "u1", nonce: "candidate-2" });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(signalDedupeKey({ type: "ice" }), null);
});
