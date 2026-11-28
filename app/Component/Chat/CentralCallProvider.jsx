"use client";

// One global call provider for BOTH messaging systems:
//   system "customer"  -> System A (customer support chat, /api/chat/*)
//   system "internal"  -> System B (admin/staff chat, /api/internal-chat/*)
// Signaling stays on the existing SSE transport; no second realtime stack.
//
// Every signal carries the SSE connection id of its sender. The server uses it
// to claim a call exactly once, so only the intended recipient's devices ring
// and an accept on one device immediately stops the ring everywhere else.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic, MicOff, Video, VideoOff, Minimize2, Phone, PhoneOff, Maximize2,
  MessageCircle, X, Volume2, VolumeX, Loader2, Grip, RotateCcw,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import useSSE, { getSseClientId } from "@/app/Component/Hooks/useSSE";
import { useNotificationSound } from "@/app/Component/Notifications/useNotificationSound";
import { authFetch } from "@/lib/authFetch";
import { isActiveConversation } from "@/lib/activeChat";
import { requestNotificationPermission, showBrowserNotification } from "@/lib/browserNotifications";
import { shouldStopRinging, signalDedupeKey } from "@/lib/callState";

const CallContext = createContext(null);
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
const RING_TIMEOUT_MS = 30000;
const LOCAL_POSITION_KEY = "adBuzzCallLocalVideoPosition";
const DEFAULT_LOCAL_SIZE = { w: 160, h: 224 };

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function mediaConstraints(callType) {
  return {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: callType === "video"
      ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
      : false,
  };
}

function createRingtoneBuffer(context) {
  const duration = 2.4;
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
  const samples = buffer.getChannelData(0);
  const pulseLength = Math.floor(sampleRate * 0.18);
  const pulseStarts = [0, 0.24, 0.98, 1.22].map((time) => Math.floor(sampleRate * time));

  for (const start of pulseStarts) {
    for (let offset = 0; offset < pulseLength && start + offset < samples.length; offset += 1) {
      const progress = offset / sampleRate;
      const envelope = Math.min(1, progress / 0.015, (0.18 - progress) / 0.025);
      samples[start + offset] += Math.sin(2 * Math.PI * 880 * progress) * Math.max(0, envelope) * 0.2;
    }
  }
  return buffer;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function Spinner({ label }) {
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function useCentralCall() {
  return useContext(CallContext);
}

export default function CentralCallProvider({ children }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { playFor } = useNotificationSound();
  const uid = user?.uid;

  const [callState, setCallState] = useState("idle");
  const [callId, setCallId] = useState(null);
  const [peerUid, setPeerUid] = useState(null);
  const [peerName, setPeerName] = useState("");
  const [peerAvatar, setPeerAvatar] = useState("");
  const [incoming, setIncoming] = useState(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [callType, setCallType] = useState("voice");
  const [chatToast, setChatToast] = useState(null);
  const [ringtoneIssue, setRingtoneIssue] = useState("");
  const [callAction, setCallAction] = useState(null); // calling | accepting | rejecting | ending
  const [callNotice, setCallNotice] = useState("");   // answered/ended on another device
  const [speakerOn, setSpeakerOn] = useState(true);
  const [speakerSupported, setSpeakerSupported] = useState(true);
  const [remoteCameraOn, setRemoteCameraOn] = useState(true);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);   // local stream changed
  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0); // remote track changed
  const [localPosition, setLocalPosition] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = JSON.parse(localStorage.getItem(LOCAL_POSITION_KEY) || "null");
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
        return {
          x: clamp(stored.x, 8, Math.max(8, window.innerWidth - (stored.w || DEFAULT_LOCAL_SIZE.w) - 8)),
          y: clamp(stored.y, 8, Math.max(8, window.innerHeight - (stored.h || DEFAULT_LOCAL_SIZE.h) - 8)),
          w: clamp(stored.w || DEFAULT_LOCAL_SIZE.w, 120, 480),
          h: clamp(stored.h || DEFAULT_LOCAL_SIZE.h, 160, 640),
        };
      }
    } catch {}
    return null;
  });

  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(null);
  const callIdRef = useRef(null);
  const ringingTimeoutRef = useRef(null);
  const ringtoneContextRef = useRef(null);
  const ringtoneBufferRef = useRef(null);
  const ringtoneSourceRef = useRef(null);
  const incomingRef = useRef(null);
  const stateRef = useRef("idle");
  const systemRef = useRef("customer");
  const callTypeRef = useRef("voice");
  const peerUidRef = useRef(null);
  const peerClientIdRef = useRef(null);
  const convIdRef = useRef(null);
  const remoteReadyRef = useRef(false);
  const answeredRef = useRef(false);
  const pendingIceRef = useRef([]);        // candidates received before remote SDP
  const pendingOutgoingIceRef = useRef([]); // candidates generated before callId/peer known
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const audioRef = useRef(null);
  const actionRef = useRef(null);
  const seenSignalsRef = useRef(new Map());
  const noticeTimerRef = useRef(null);
  const dragRef = useRef(null);
  // Refs are authoritative for media state: state only mirrors them for the UI,
  // so fast repeated toggles can never act on a stale closure.
  const mutedRef = useRef(false);
  const cameraOnRef = useRef(true);
  const speakerOnRef = useRef(true);
  const remoteStreamRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const iceRestartTimerRef = useRef(null);
  const restartCountRef = useRef(0);
  const isInitiatorRef = useRef(false);

  // The SSE connection id arrives asynchronously after mount; read it at call
  // time instead of freezing a stale value in a callback closure.
  const currentClientId = useCallback(() => getSseClientId(uid), [uid]);

  const setState = useCallback((next) => {
    stateRef.current = next;
    setCallState(next);
  }, []);

  const setPendingIncoming = useCallback((next) => {
    incomingRef.current = next;
    setIncoming(next);
  }, []);

  const setActiveCallType = useCallback((next) => {
    const normalized = next === "video" ? "video" : "voice";
    callTypeRef.current = normalized;
    setCallType(normalized);
    setRemoteCameraOn(normalized === "video");
  }, []);

  // Apply the authoritative mute/camera state to whatever tracks are currently
  // live. Late-arriving tracks are handled by setStream/replaceStream below.
  const applyMediaState = useCallback((stream) => {
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => { track.enabled = !mutedRef.current; });
    stream.getVideoTracks().forEach((track) => { track.enabled = cameraOnRef.current; });
  }, []);

  const setAction = useCallback((next) => {
    actionRef.current = next;
    setCallAction(next);
  }, []);

  const minimize = useCallback(() => setMinimized(true), []);
  const restore = useCallback(() => setMinimized(false), []);

  const showNotice = useCallback((message) => {
    setCallNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setCallNotice(""), 3500);
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringtoneSourceRef.current) {
      try { ringtoneSourceRef.current.stop(); } catch {}
      try { ringtoneSourceRef.current.disconnect(); } catch {}
      ringtoneSourceRef.current = null;
    }
  }, []);

  const startRingtone = useCallback(async () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        setRingtoneIssue("This browser cannot play the ringtone. Keep this incoming-call alert open.");
        return false;
      }
      const ctx = ringtoneContextRef.current || new Ctx();
      ringtoneContextRef.current = ctx;
      if (ctx.state !== "running") await ctx.resume();
      if (ctx.state !== "running") {
        setRingtoneIssue("Your browser blocked call audio. Select Enable sound to allow the incoming ringtone.");
        return false;
      }
      if (ringtoneSourceRef.current) return true;
      if (!ringtoneBufferRef.current) ringtoneBufferRef.current = createRingtoneBuffer(ctx);
      const source = ctx.createBufferSource();
      source.buffer = ringtoneBufferRef.current;
      source.loop = true;
      source.connect(ctx.destination);
      source.start();
      ringtoneSourceRef.current = source;
      setRingtoneIssue("");
      return true;
    } catch {
      setRingtoneIssue("Your browser blocked call audio. Select Enable sound to allow the incoming ringtone.");
      return false;
    }
  }, []);

  // Create/resume WebAudio during a gesture so incoming SSE events can ring
  // later. The looping buffer keeps playing in background tabs without timers.
  useEffect(() => {
    const unlock = () => {
      requestNotificationPermission();
      if (stateRef.current === "ringing") {
        startRingtone();
        return;
      }
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = ringtoneContextRef.current || new Ctx();
        ringtoneContextRef.current = ctx;
        if (ctx.state !== "running") ctx.resume().catch(() => {});
      } catch {}
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchend", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchend", unlock);
    };
  }, [startRingtone]);

  const setMutedState = useCallback((next) => {
    mutedRef.current = next;
    setMuted(next);
    applyMediaState(streamRef.current);
  }, [applyMediaState]);

  const setCameraState = useCallback((next) => {
    cameraOnRef.current = next;
    setCameraOn(next);
    applyMediaState(streamRef.current);
  }, [applyMediaState]);

  // Store a newly acquired stream, replacing tracks on the live peer connection
  // instead of tearing it down. This is also how we recover from a delayed
  // camera permission or a video track that ended mid-call.
  const replaceStream = useCallback(async (stream) => {
    const pc = pcRef.current;
    let safeToStopPrevious = true;
    if (pc) {
      for (const kind of ["audio", "video"]) {
        const sender = pc.getSenders().find((candidate) => candidate.track?.kind === kind);
        const track = stream.getTracks().find((candidate) => candidate.kind === kind);
        if (sender && track && sender.track?.id !== track.id) {
          try { await sender.replaceTrack(track); } catch { safeToStopPrevious = false; }
        }
      }
    }
    const previous = streamRef.current;
    streamRef.current = stream;
    applyMediaState(stream);
    setStreamVersion((version) => version + 1);
    // Never stop tracks the peer connection might still be using.
    if (previous && previous !== stream && safeToStopPrevious) {
      previous.getTracks().forEach((track) => track.stop());
    }
  }, [applyMediaState]);

  const applySpeaker = useCallback(async (enabled) => {
    speakerOnRef.current = enabled;
    const element = callTypeRef.current === "video" ? remoteVideoRef.current : audioRef.current;
    if (!element || typeof element.setSinkId !== "function") {
      setSpeakerSupported(false);
      return;
    }
    try {
      const devices = typeof navigator?.mediaDevices?.enumerateDevices === "function"
        ? await navigator.mediaDevices.enumerateDevices()
        : [];
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      const preferred = outputs.find((d) => /speaker|default/i.test(d.label || "")) || outputs[0];
      // "" selects the browser default (earpiece on mobile where supported).
      await element.setSinkId(enabled && preferred?.deviceId ? preferred.deviceId : "");
      setSpeakerSupported(true);
    } catch {
      setSpeakerSupported(false);
    }
  }, []);

  const cleanupMedia = useCallback(() => {
    stopRingtone();
    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
    ringingTimeoutRef.current = null;
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    if (iceRestartTimerRef.current) clearTimeout(iceRestartTimerRef.current);
    iceRestartTimerRef.current = null;
    restartCountRef.current = 0;
    isInitiatorRef.current = false;
    startedAtRef.current = null;
    if (pcRef.current) {
      const pc = pcRef.current;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try { pc.close(); } catch {}
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    remoteStreamRef.current = null;
    remoteReadyRef.current = false;
    pendingIceRef.current = [];
    pendingOutgoingIceRef.current = [];
    seenSignalsRef.current.clear();
    peerClientIdRef.current = null;
    setCallNotice("");
  }, [stopRingtone]);

  const resetCall = useCallback(() => {
    cleanupMedia();
    callIdRef.current = null;
    peerUidRef.current = null;
    convIdRef.current = null;
    answeredRef.current = false;
    setCallId(null);
    setPeerUid(null);
    setPeerName("");
    setPeerAvatar("");
    setPendingIncoming(null);
    setRingtoneIssue("");
    setDuration(0);
    mutedRef.current = false;
    cameraOnRef.current = true;
    speakerOnRef.current = true;
    setMuted(false);
    setCameraOn(true);
    setSpeakerOn(true);
    setStreamVersion((version) => version + 1);
    setRemoteStreamVersion((version) => version + 1);
    setMinimized(false);
    setRemoteCameraOn(true);
    setRemoteMuted(false);
    setAction(null);
    callTypeRef.current = "voice";
    setCallType("voice");
    setState("idle");
  }, [cleanupMedia, setPendingIncoming, setState, setAction]);

  const sendSignal = useCallback(async (toUid, type, payload, cId, system = systemRef.current, toClientId = null) => {
    if (!uid || !toUid) return;
    const target = toUid || peerUidRef.current;
    try {
      const endpoint = system === "internal" ? "/api/internal-chat/signal" : "/api/chat/signal";
      const body = {
        conversationId: convIdRef.current || undefined,
        callId: cId || callIdRef.current,
        type,
        payload,
        fromClientId: currentClientId() || undefined,
        toClientId: toClientId || undefined,
      };
      if (system === "internal") body.toUid = target;
      else { body.fromUid = uid; body.toUid = target; }
      await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, user);
    } catch {
      // Signaling failures are surfaced by the call state / timeout, not thrown.
    }
  }, [uid, user, currentClientId]);

  const updateCallStatus = useCallback(async (cId, status, dur, system = systemRef.current) => {
    if (!uid || !cId) return null;
    try {
      const endpoint = system === "internal" ? "/api/internal-chat/calls" : "/api/chat/calls";
      const res = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update", callId: cId, status, duration: dur, fromClientId: currentClientId() || undefined,
          ...(system === "internal" ? {} : { uid }),
        }),
      }, user);
      const data = await res.json().catch(() => ({}));
      return data;
    } catch {
      return null;
    }
  }, [uid, user, currentClientId]);

  const createCallRecord = useCallback(async ({ conversationId, targetUid, type, system }) => {
    const endpoint = system === "internal" ? "/api/internal-chat/calls" : "/api/chat/calls";
    const body = {
      action: "create", conversationId, receiverId: targetUid || undefined, callType: type,
      fromClientId: currentClientId() || undefined,
    };
    if (system !== "internal") body.uid = uid;
    const res = await authFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, user);
    const data = await res.json().catch(() => ({}));
    if (!data.success || !data.call?.callId) throw new Error(data.message || "Could not create call");
    if (data.unavailable) throw new Error(data.message || "That person is offline right now.");
    return data.call;
  }, [uid, user, currentClientId]);

  const startConnectedTimer = useCallback(() => {
    if (startedAtRef.current) return;
    startedAtRef.current = Date.now();
    setDuration(0);
    stopRingtone();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setDuration(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);
    applySpeaker(speakerOn);
  }, [stopRingtone, applySpeaker, speakerOn]);

  // Never write directly to a DOM element from ontrack: the element may not be
  // mounted yet. Keep the stream in a ref and let an effect attach it whenever
  // the element or stream becomes available.
  const attachRemoteStream = useCallback((stream) => {
    if (!stream) return;
    remoteStreamRef.current = stream;
    setRemoteStreamVersion((version) => version + 1);
  }, []);

  const flushPendingIce = useCallback(async (pc) => {
    if (!pc || !pc.remoteDescription) return;
    const items = pendingIceRef.current.splice(0);
    // Add in one batch instead of awaiting each candidate in sequence.
    await Promise.allSettled(items.map((candidate) => pc.addIceCandidate(new RTCIceCandidate(candidate))));
  }, []);

  const flushOutgoingIce = useCallback((cId) => {
    const items = pendingOutgoingIceRef.current.splice(0);
    items.forEach((candidate) => sendSignal(peerUidRef.current, "ice", { candidate }, cId));
  }, [sendSignal]);

  const handleConnectionFailed = useCallback(() => {
    const cId = callIdRef.current;
    const system = systemRef.current;
    const wasAnswered = answeredRef.current;
    if (cId && !actionRef.current) {
      sendSignal(peerUidRef.current, wasAnswered ? "end" : "cancel", {}, cId, system);
      updateCallStatus(cId, wasAnswered ? "ended" : "missed", 0, system);
    }
    resetCall();
  }, [sendSignal, updateCallStatus, resetCall]);

  // Only the initiator restarts ICE, which avoids glare from both sides
  // sending an offer at the same time after a network interruption.
  const attemptIceRestart = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !isInitiatorRef.current || !callIdRef.current || restartCountRef.current >= 2) return;
    if (pc.signalingState === "closed" || pc.connectionState === "connected") return;
    restartCountRef.current += 1;
    try {
      if (typeof pc.restartIce === "function") pc.restartIce();
      const offer = await pc.createOffer({ iceRestart: true });
      if (pcRef.current !== pc || pc.signalingState === "closed") return;
      await pc.setLocalDescription(offer);
      await sendSignal(peerUidRef.current, "renegotiate", { sdp: offer }, callIdRef.current);
    } catch {}
  }, [sendSignal]);

  const setupPeerConnection = useCallback((remoteUid) => {
    // A retried accept must never leak the previous peer connection.
    if (pcRef.current) {
      const old = pcRef.current;
      old.onicecandidate = null;
      old.ontrack = null;
      old.onconnectionstatechange = null;
      try { old.close(); } catch {}
      pcRef.current = null;
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    restartCountRef.current = 0;
    pc.onicecandidate = (event) => {
      if (!event.candidate || pcRef.current !== pc) return;
      const cId = callIdRef.current;
      // Candidates can fire before the call record exists: buffer them.
      if (!cId || !peerUidRef.current) pendingOutgoingIceRef.current.push(event.candidate);
      else sendSignal(remoteUid || peerUidRef.current, "ice", { candidate: event.candidate }, cId);
    };
    pc.ontrack = (event) => {
      const track = event.track;
      let stream = remoteStreamRef.current;
      if (!stream) {
        stream = new MediaStream();
        remoteStreamRef.current = stream;
      }
      if (!stream.getTracks().some((existing) => existing.id === track.id)) stream.addTrack(track);
      if (track.kind === "video") {
        setRemoteCameraOn(stream.getVideoTracks().some((candidate) => candidate.readyState === "live"));
        track.onmute = () => setRemoteCameraOn(false);
        track.onunmute = () => setRemoteCameraOn(true);
        track.onended = () => setRemoteCameraOn(false);
      }
      attachRemoteStream(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc || pc.signalingState === "closed") return;
      if (pc.connectionState === "connected") {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
        answeredRef.current = true;
        setState("connected");
        startConnectedTimer();
        // Persist the real connection time so duration and history are exact.
        if (callIdRef.current) updateCallStatus(callIdRef.current, "connected", 0, systemRef.current);
      } else if (pc.connectionState === "disconnected") {
        // A brief disconnect is normal during network handover. Wait before
        // changing state; reconnect if it resolves on its own.
        setState("connecting");
        if (!reconnectTimerRef.current && !iceRestartTimerRef.current) {
          iceRestartTimerRef.current = setTimeout(() => {
            iceRestartTimerRef.current = null;
            if (pcRef.current === pc && pc.connectionState !== "connected") attemptIceRestart();
          }, 5000);
        }
      } else if (pc.connectionState === "failed") {
        if (isInitiatorRef.current) {
          if (restartCountRef.current < 2) attemptIceRestart();
          else handleConnectionFailed();
        } else if (!reconnectTimerRef.current) {
          // The initiator will send a renegotiation offer; give it a moment.
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (pcRef.current === pc && pc.connectionState !== "connected") handleConnectionFailed();
          }, 10000);
        }
      }
    };
    return pc;
  }, [attachRemoteStream, attemptIceRestart, handleConnectionFailed, sendSignal, setState, startConnectedTimer, updateCallStatus]);

  const startCall = useCallback(async ({
    conversationId,
    targetUid,
    targetName = "User",
    targetAvatar = "",
    callType: requestedType = "voice",
    system = "customer",
  }) => {
    if (!uid || stateRef.current !== "idle" || actionRef.current) return;
    setAction("calling");
    try {
      systemRef.current = system;
      setActiveCallType(requestedType);
      convIdRef.current = conversationId || null;
      peerUidRef.current = targetUid || null;
      setPeerUid(targetUid || null);
      setPeerName(targetName);
      setPeerAvatar(targetAvatar || "");
      isInitiatorRef.current = true;
      mutedRef.current = false;
      cameraOnRef.current = requestedType === "video";
      setMuted(false);
      setCameraOn(cameraOnRef.current);
      setState("calling");

      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(callTypeRef.current));
      await replaceStream(stream);

      const pc = setupPeerConnection(targetUid);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const call = await createCallRecord({ conversationId, targetUid, type: callTypeRef.current, system });
      callIdRef.current = call.callId;
      setCallId(call.callId);
      // The server may resolve an unassigned customer call to one specific
      // online staff member. Signal that exact recipient, never a channel.
      const resolvedTarget = call.receiverId || targetUid;
      if (resolvedTarget) {
        peerUidRef.current = resolvedTarget;
        setPeerUid(resolvedTarget);
      }
      await sendSignal(resolvedTarget, "offer", { sdp: offer, callType: callTypeRef.current }, call.callId, system);
      if (resolvedTarget) flushOutgoingIce(call.callId);

      ringingTimeoutRef.current = setTimeout(() => {
        if (stateRef.current === "calling") {
          updateCallStatus(callIdRef.current, "missed", 0, system);
          sendSignal(targetUid, "missed", {}, callIdRef.current, system);
          showBrowserNotification({
            id: `missed_${callIdRef.current}`,
            title: "Missed call",
            body: peerUidRef.current ? `No answer from ${peerName || "your colleague"}` : "No answer",
            tag: `call_${callIdRef.current}`,
          });
          resetCall();
        }
      }, RING_TIMEOUT_MS);
    } catch (error) {
      const message = error?.message || "Unable to start call";
      if (stateRef.current !== "idle") {
        showNotice(message);
        resetCall();
      }
    } finally {
      if (actionRef.current === "calling") setAction(null);
    }
  }, [uid, peerName, setupPeerConnection, replaceStream, createCallRecord, sendSignal, flushOutgoingIce, updateCallStatus, resetCall, setState, setActiveCallType, setAction, showNotice]);

  const acceptCall = useCallback(async () => {
    const call = incomingRef.current;
    // In-flight guard: clear the incoming ref synchronously so a fast double
    // click can never open two peer connections or two answers.
    if (!call || !call.callId || actionRef.current) return;
    setAction("accepting");
    setPendingIncoming(null);
    stopRingtone();
    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
    ringingTimeoutRef.current = null;
    try {
      const system = call.system || "customer";
      systemRef.current = system;
      setActiveCallType(call.callType);
      peerUidRef.current = call.fromUid;
      peerClientIdRef.current = call.fromClientId || null;
      convIdRef.current = call.conversationId || null;
      callIdRef.current = call.callId;
      answeredRef.current = true;
      isInitiatorRef.current = false;
      mutedRef.current = false;
      cameraOnRef.current = callTypeRef.current === "video";
      setMuted(false);
      setCameraOn(cameraOnRef.current);

      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(callTypeRef.current));
      await replaceStream(stream);

      const pc = setupPeerConnection(call.fromUid);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(call.payload?.sdp));
      remoteReadyRef.current = true;
      await flushPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      setCallId(call.callId);
      setPeerUid(call.fromUid);
      setPeerName(call.fromName || "User");
      setPeerAvatar(call.fromAvatar || "");
      setState("connecting");

      await sendSignal(call.fromUid, "answer", { sdp: answer }, call.callId, system, peerClientIdRef.current);
      const result = await updateCallStatus(call.callId, "accepted", 0, system);
      if (result?.claimedByOther) {
        showNotice(`Call answered on another device by ${result.claim?.byUid === uid ? "you" : "someone else"}.`);
        resetCall();
        return;
      }
      await sendSignal(call.fromUid, "accepted", { byUid: uid, byClientId: currentClientId() }, call.callId, system, peerClientIdRef.current);
      flushOutgoingIce(call.callId);
    } catch (error) {
      showNotice(error?.message || "Unable to answer call");
      resetCall();
    } finally {
      if (actionRef.current === "accepting") setAction(null);
    }
  }, [uid, currentClientId, stopRingtone, setupPeerConnection, replaceStream, flushPendingIce, sendSignal, updateCallStatus, flushOutgoingIce, resetCall, setPendingIncoming, setState, setActiveCallType, setAction, showNotice]);

  const rejectCall = useCallback(async () => {
    const call = incomingRef.current;
    if (!call || actionRef.current) return;
    setAction("rejecting");
    stopRingtone();
    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
    ringingTimeoutRef.current = null;
    setPendingIncoming(null);
    await sendSignal(call.fromUid, "reject", {}, call.callId, call.system, call.fromClientId || null);
    await updateCallStatus(call.callId, "rejected", 0, call.system);
    resetCall();
  }, [sendSignal, updateCallStatus, stopRingtone, resetCall, setPendingIncoming, setAction]);

  const endCall = useCallback(async () => {
    const cId = callIdRef.current;
    const target = peerUidRef.current;
    const system = systemRef.current;
    const wasAnswered = answeredRef.current;
    if (!cId || actionRef.current) return;
    setAction("ending");
    stopRingtone();
    const dur = wasAnswered && startedAtRef.current
      ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
      : 0;
    await sendSignal(target, wasAnswered ? "end" : "cancel", {}, cId, system, peerClientIdRef.current);
    await updateCallStatus(cId, wasAnswered ? "ended" : "missed", dur, system);
    if (!wasAnswered && !isActiveConversation(convIdRef.current, system)) {
      showBrowserNotification({
        id: `missed_${cId}`,
        title: "Missed call",
        body: peerName ? `Call to ${peerName} was not answered` : "Call was not answered",
        tag: `call_${cId}`,
      });
    }
    resetCall();
  }, [sendSignal, updateCallStatus, resetCall, peerName, stopRingtone, setAction]);

  const toggleMute = useCallback(() => {
    if (stateRef.current === "idle") return;
    const next = !mutedRef.current;
    setMutedState(next);
    if (callIdRef.current) {
      sendSignal(peerUidRef.current, "media", { muted: next, cameraOn: cameraOnRef.current, nonce: `mute_${Date.now()}` }, callIdRef.current);
    }
  }, [setMutedState, sendSignal]);

  // If camera permission arrived late (or the track ended), acquire a fresh
  // video track and swap it into the existing sender without renegotiating.
  const ensureVideoTrack = useCallback(async () => {
    const current = streamRef.current;
    if (current?.getVideoTracks().some((track) => track.readyState === "live")) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      showNotice("Camera is not available on this device.");
      return false;
    }
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: false, video: mediaConstraints("video").video });
      const track = fresh.getVideoTracks()[0];
      if (!track) throw new Error("No camera track");
      const pc = pcRef.current;
      if (current) {
        current.addTrack(track);
        applyMediaState(current);
        setStreamVersion((version) => version + 1);
        const sender = pc?.getSenders().find((candidate) => candidate.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
        else if (pc) pc.addTrack(track, current);
        fresh.getTracks().forEach((extra) => { if (extra !== track) extra.stop(); });
      } else {
        await replaceStream(fresh);
        if (pc) fresh.getTracks().forEach((extra) => pc.addTrack(extra, fresh));
      }
      if (callIdRef.current) {
        sendSignal(peerUidRef.current, "media", { muted: mutedRef.current, cameraOn: true, nonce: `camera_${Date.now()}` }, callIdRef.current);
      }
      return true;
    } catch (error) {
      showNotice(error?.name === "NotAllowedError" ? "Camera permission was denied." : "Camera is not available on this device.");
      setCameraState(false);
      return false;
    }
  }, [applyMediaState, replaceStream, sendSignal, setCameraState, showNotice]);

  const toggleCamera = useCallback(() => {
    if (stateRef.current === "idle") return;
    const next = !cameraOnRef.current;
    // Disabling the track keeps the peer connection alive; enabling it again
    // resumes the same feed with no renegotiation or element remount.
    setCameraState(next);
    if (next) ensureVideoTrack();
    if (callIdRef.current) {
      sendSignal(peerUidRef.current, "media", { muted: mutedRef.current, cameraOn: next, nonce: `camera_${Date.now()}` }, callIdRef.current);
    }
  }, [setCameraState, ensureVideoTrack, sendSignal]);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerOnRef.current;
    setSpeakerOn(next);
    applySpeaker(next);
  }, [applySpeaker]);

  const dedupeSignal = useCallback((data, system) => {
    const sdp = data.payload?.sdp?.sdp;
    const sdpNonce = sdp ? `${String(sdp).length}:${String(sdp).slice(0, 48)}` : "";
    const nonce = data.type === "ice"
      ? (data.payload?.candidate?.candidate || "")
      : (data.payload?.nonce || sdpNonce);
    const key = signalDedupeKey({ system, callId: data.callId, type: data.type, fromUid: data.fromUid, nonce });
    if (!key) return false;
    const now = Date.now();
    for (const [storedKey, at] of seenSignalsRef.current) {
      if (now - at > 2 * 60 * 1000) seenSignalsRef.current.delete(storedKey);
    }
    if (seenSignalsRef.current.has(key)) return true;
    seenSignalsRef.current.set(key, now);
    return false;
  }, []);

  const handleSignal = useCallback(async (data, system) => {
    if (!data?.callId || !uid) return;
    const cId = String(data.callId);
    if (dedupeSignal(data, system)) return;

    if (data.type === "offer") {
      if (stateRef.current !== "idle") {
        if (callIdRef.current !== cId) {
          sendSignal(data.fromUid, "reject", {}, cId, system, data.fromClientId || null);
          updateCallStatus(cId, "rejected", 0, system);
        }
        return;
      }
      systemRef.current = system;
      setActiveCallType(data.callType === "video" || data.payload?.callType === "video" ? "video" : "voice");
      convIdRef.current = data.conversationId || null;
      peerUidRef.current = data.fromUid;
      peerClientIdRef.current = data.fromClientId || null;
      setPendingIncoming({
        callId: cId,
        fromUid: data.fromUid,
        fromClientId: data.fromClientId || null,
        fromName: data.fromName || "User",
        fromAvatar: data.fromAvatar || "",
        conversationId: data.conversationId,
        callType: callTypeRef.current,
        system,
        payload: data.payload,
      });
      setPeerUid(data.fromUid);
      setPeerName(data.fromName || "User");
      setPeerAvatar(data.fromAvatar || "");
      cameraOnRef.current = callTypeRef.current === "video";
      setCameraOn(cameraOnRef.current);
      setState("ringing");
      setRingtoneIssue("");
      startRingtone();
      showBrowserNotification({
        id: `call_${cId}`,
        title: `Incoming ${callTypeRef.current} call`,
        body: data.fromName || "Ad Buzz",
        tag: `call_${cId}`,
      });
      ringingTimeoutRef.current = setTimeout(() => {
        if (stateRef.current === "ringing" && incomingRef.current?.callId === cId) {
          updateCallStatus(cId, "missed", 0, system);
          sendSignal(data.fromUid, "missed", {}, cId, system, data.fromClientId || null);
          resetCall();
        }
      }, RING_TIMEOUT_MS);
    } else if (data.type === "answer") {
      if (callIdRef.current !== cId) return;
      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
      peerUidRef.current = data.fromUid;
      peerClientIdRef.current = data.fromClientId || peerClientIdRef.current;
      setState("connecting");
      flushOutgoingIce(cId);
      const pc = pcRef.current;
      if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(data.payload?.sdp))
          .then(() => { remoteReadyRef.current = true; return flushPendingIce(pc); })
          .catch(() => handleConnectionFailed());
      }
    } else if (data.type === "renegotiate" || data.type === "renegotiate-answer") {
      // ICE restart after a network interruption. The answerer applies the new
      // offer on the same peer connection and replies on the same connection.
      if (callIdRef.current !== cId) return;
      const pc = pcRef.current;
      if (!pc || pc.signalingState === "closed" || !data.payload?.sdp) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
        remoteReadyRef.current = true;
        await flushPendingIce(pc);
        if (data.type === "renegotiate") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(data.fromUid, "renegotiate-answer", { sdp: answer }, cId, system, data.fromClientId || null);
        }
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      } catch {}
    } else if (data.type === "ice") {
      const candidate = data.payload?.candidate;
      // ICE candidates are call-scoped: never inject one into an unrelated PC.
      if (!candidate || callIdRef.current !== cId) return;
      const pc = pcRef.current;
      if (pc && remoteReadyRef.current) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingIceRef.current.push(candidate);
      }
    } else if (data.type === "media") {
      if (callIdRef.current !== cId) return;
      if (typeof data.payload?.cameraOn === "boolean") setRemoteCameraOn(data.payload.cameraOn);
      if (typeof data.payload?.muted === "boolean") setRemoteMuted(data.payload.muted);
    } else if (["end", "cancel", "reject", "missed"].includes(data.type)) {
      if (callIdRef.current === cId || incomingRef.current?.callId === cId) {
        if (data.type === "missed" && !isActiveConversation(data.conversationId, system)) {
          showBrowserNotification({
            id: `missed_${cId}`,
            title: "Missed call",
            body: data.fromName || "A call was missed",
            tag: `call_${cId}`,
          });
        }
        stopRingtone();
        resetCall();
      }
    } else if (data.type === "accepted") {
      // An accept from any device (including another device of the callee)
      // immediately stops the ringtone and marks the call as accepted.
      if (callIdRef.current === cId || incomingRef.current?.callId === cId) {
        stopRingtone();
        if (stateRef.current === "ringing" && data.byClientId !== currentClientId()) {
          showNotice("Call accepted on another device.");
          resetCall();
        }
      }
    }
  }, [uid, currentClientId, dedupeSignal, sendSignal, updateCallStatus, resetCall, setPendingIncoming, startRingtone, setState, setActiveCallType, flushOutgoingIce, flushPendingIce, handleConnectionFailed, stopRingtone, showNotice]);

  const handleCallStatus = useCallback((data) => {
    if (!data?.call?.callId || !uid) return;
    const cId = String(data.call.callId);
    if (callIdRef.current !== cId && incomingRef.current?.callId !== cId) return;
    if (shouldStopRinging({
      state: stateRef.current,
      callId: cId,
      activeCallId: callIdRef.current,
      incomingCallId: incomingRef.current?.callId,
      status: data.status,
    })) stopRingtone();
    if (data.status === "accepted" || data.status === "connected") {
      stopRingtone();
      if (stateRef.current === "ringing" && data.byClientId !== currentClientId()) {
        showNotice(data.byUid === uid ? "Call accepted on another device." : `Call accepted by ${data.call?.receiverId === uid ? "you" : "the recipient"}.`);
        resetCall();
      }
      return;
    }
    if (["ended", "rejected", "missed", "cancelled"].includes(data.status)) {
      stopRingtone();
      if (data.byUid && data.byUid !== uid && (callIdRef.current === cId || incomingRef.current?.callId === cId)) {
        const label = data.status === "rejected" ? "Call rejected" : data.status === "missed" ? "Missed call" : "Call ended";
        showNotice(`${label} by the other party.`);
      }
      resetCall();
    }
  }, [uid, currentClientId, stopRingtone, showNotice, resetCall]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if ((type === "chat:message" || type === "internal:message") && data?.message?.senderId !== uid) {
        const system = type === "internal:message" ? "internal" : "customer";
        // No toast / desktop popup for the conversation being read right now.
        if (!isActiveConversation(data.conversationId, system)) {
          const sender = data.message.senderNameSnapshot || "New message";
          const preview = data.message.content || (data.message.messageType === "voice" ? "Voice message" : "Attachment");
          playFor({ _id: data.message.messageId, read: false });
          setChatToast({
            id: data.message.messageId,
            senderName: sender,
            preview,
            conversationId: data.conversationId,
            system,
          });
          showBrowserNotification({
            id: `msg_${data.message.messageId}`,
            title: sender,
            body: preview,
            tag: `conv_${data.conversationId}`,
          });
          setTimeout(() => setChatToast((current) => current?.id === data.message.messageId ? null : current), 6000);
        }
      }
      if (type === "chat:signal") handleSignal(data, "customer");
      if (type === "internal:signal") handleSignal(data, "internal");
      if (type === "chat:call-status") handleCallStatus(data);
      if (type === "internal:call-status") handleCallStatus(data);
    },
  });

  useEffect(() => {
    if (!localPosition || typeof window === "undefined") return;
    try { localStorage.setItem(LOCAL_POSITION_KEY, JSON.stringify(localPosition)); } catch {}
  }, [localPosition]);

  const resetLocalPosition = () => {
    if (typeof window === "undefined") return;
    setLocalPosition({
      x: Math.max(8, window.innerWidth - DEFAULT_LOCAL_SIZE.w - 16),
      y: Math.max(8, window.innerHeight - DEFAULT_LOCAL_SIZE.h - 80),
      ...DEFAULT_LOCAL_SIZE,
    });
  };

  const handleLocalDrag = (event, mode) => {
    if (!localPosition || !mode) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { mode, startX: event.clientX, startY: event.clientY, start: { ...localPosition } };
  };

  const handleLocalDragMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.mode === "resize") {
      const w = clamp(drag.start.w + dx, 120, Math.min(480, window.innerWidth - 16));
      const h = clamp(drag.start.h + dy, 160, Math.min(640, window.innerHeight - 16));
      setLocalPosition({ x: drag.start.x, y: drag.start.y, w, h });
    } else {
      setLocalPosition({
        ...drag.start,
        x: clamp(drag.start.x + dx, 8, Math.max(8, window.innerWidth - drag.start.w - 8)),
        y: clamp(drag.start.y + dy, 8, Math.max(8, window.innerHeight - drag.start.h - 8)),
      });
    }
  };

  const endLocalDrag = () => { dragRef.current = null; };

  // Attach streams after render: refs may not exist when getUserMedia/ontrack
  // fires, and a late track must still reach the element once it mounts.
  useEffect(() => {
    const element = localVideoRef.current;
    const stream = streamRef.current;
    if (!element || !stream) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    element.play?.().catch(() => {});
  }, [callState, callType, streamVersion, cameraOn]);

  useEffect(() => {
    const stream = remoteStreamRef.current;
    if (!stream) return;
    const element = callTypeRef.current === "video" ? remoteVideoRef.current : audioRef.current;
    if (!element) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    element.play?.().catch(() => {});
  }, [callState, callType, remoteStreamVersion, minimized]);

  useEffect(() => {
    if (stateRef.current === "connected" || stateRef.current === "connecting") applySpeaker(speakerOn);
  }, [speakerOn, applySpeaker, callState]);

  // Release media/timers if the provider ever unmounts (no leaked WebRTC).
  useEffect(() => () => {
    cleanupMedia();
    const ctx = ringtoneContextRef.current;
    ringtoneContextRef.current = null;
    ringtoneBufferRef.current = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
  }, [cleanupMedia]);

  // Consumers (all chat pages) only need actions. Keeping volatile call state
  // out of this context prevents the once-per-second duration tick from
  // re-rendering every chat surface in the app.
  const contextValue = useMemo(() => ({
    startCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleCamera, toggleSpeaker, minimize, restore,
  }), [startCall, acceptCall, rejectCall, endCall, toggleMute, toggleCamera, toggleSpeaker, minimize, restore]);

  if (!uid) return <CallContext.Provider value={contextValue}>{children}</CallContext.Provider>;

  const isRinging = callState === "ringing";
  const isVideoActive = callType === "video" && ["connecting", "connected"].includes(callState) && !minimized;
  const statusLabel = isRinging ? "Incoming call" : callState === "calling" ? "Calling..."
    : callState === "connecting" ? "Connecting..." : "Connected";
  const typeLabel = callType === "video" ? "Video call" : "Voice call";
  const busy = Boolean(callAction);

  const peerMedia = (
    <div className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-2xl font-bold ${isVideoActive ? "h-24 w-24" : ""}`}>
      {peerAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={peerAvatar} alt="" className="h-full w-full object-cover" />
      ) : (peerName || "User").charAt(0).toUpperCase()}
    </div>
  );

  const actionButtons = isRinging ? (
    <div className="flex justify-center gap-4">
      <button
        type="button" onClick={rejectCall} disabled={busy}
        className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-red-500 p-4 text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        aria-label={callAction === "rejecting" ? "Rejecting call" : "Reject call"}
      >
        {callAction === "rejecting" ? <Loader2 size={22} className="animate-spin" /> : <PhoneOff size={22} />}
      </button>
      <button
        type="button" onClick={acceptCall} disabled={busy}
        className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-green-500 p-4 text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        aria-label={callAction === "accepting" ? "Accepting call" : "Accept call"}
      >
        {callAction === "accepting" ? <Loader2 size={22} className="animate-spin" /> : <Phone size={22} />}
      </button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
      <button
        type="button" onClick={toggleMute} aria-pressed={muted}
        aria-label={muted ? "Unmute microphone" : "Mute microphone"}
        className={`flex min-h-12 min-w-12 items-center justify-center rounded-full p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${muted ? "bg-orange-500" : "bg-slate-700 hover:bg-slate-600"}`}
      >
        {muted ? <MicOff size={22} /> : <Mic size={22} />}
      </button>
      <button
        type="button" onClick={toggleSpeaker} aria-pressed={speakerOn}
        aria-label={speakerOn ? "Turn speaker off" : "Turn speaker on"}
        title={speakerSupported ? (speakerOn ? "Speaker on" : "Speaker off") : "Speaker selection is not supported on this device"}
        className={`flex min-h-12 min-w-12 items-center justify-center rounded-full p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${speakerOn ? "bg-slate-700 hover:bg-slate-600" : "bg-orange-500"}`}
      >
        {speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
      </button>
      {callType === "video" && (
        <button
          type="button" onClick={toggleCamera} aria-pressed={cameraOn}
          aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
          className={`flex min-h-12 min-w-12 items-center justify-center rounded-full p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${cameraOn ? "bg-slate-700 hover:bg-slate-600" : "bg-orange-500"}`}
        >
          {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
        </button>
      )}
      <button
        type="button" onClick={endCall} disabled={busy} aria-label={callAction === "ending" ? "Ending call" : "End call"}
        className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-red-500 p-4 text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        {callAction === "ending" ? <Loader2 size={22} className="animate-spin" /> : <PhoneOff size={22} />}
      </button>
    </div>
  );

  const statusBlock = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{statusLabel}</span>
        {!isRinging && !busy && (
          <button type="button" onClick={() => setMinimized(true)} className="flex min-h-10 min-w-10 items-center justify-center rounded-full p-2 hover:bg-slate-800" aria-label="Minimize call">
            <Minimize2 size={18} />
          </button>
        )}
      </div>
      {busy && (
        <div className="mt-2 text-center text-sm text-orange-300">
          <Spinner label={callAction === "accepting" ? "Accepting call…" : callAction === "rejecting" ? "Rejecting call…" : callAction === "ending" ? "Ending call…" : "Calling…"} />
        </div>
      )}
      {!isVideoActive && (
        <div className="flex flex-col items-center py-4 sm:py-6">
          {peerMedia}
          <p className="mt-3 text-lg font-semibold">{peerName || "User"}</p>
          <p className="mt-1 text-sm text-slate-300">
            {callState === "connected" ? formatDuration(duration) : busy ? statusLabel : typeLabel}
          </p>
          {!isRinging && remoteMuted && <p className="mt-1 text-xs text-slate-400">Other participant is muted</p>}
          {!isRinging && muted && <p className="mt-1 text-xs text-orange-300">Your microphone is off</p>}
        </div>
      )}
      {actionButtons}
      {isRinging && ringtoneIssue && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-center text-sm text-amber-950" role="alert" aria-live="assertive">
          <p>{ringtoneIssue}</p>
          <button type="button" onClick={startRingtone} className="mt-2 min-h-10 rounded-lg bg-amber-700 px-3 py-2 font-semibold text-white hover:bg-amber-800">
            Enable sound
          </button>
        </div>
      )}
    </>
  );

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      <audio ref={audioRef} id="central-call-audio" autoPlay playsInline />
      {callType === "video" && ["connecting", "connected"].includes(callState) && (
        <>
          <video
            ref={remoteVideoRef}
            id="central-call-remote-video"
            autoPlay
            playsInline
            className={`fixed inset-0 z-[80] h-full w-full bg-slate-950 object-contain ${minimized ? "hidden" : "block"}`}
            aria-label={`${peerName || "Participant"} camera`}
          />
          {!remoteCameraOn && !minimized && (
            <div className="pointer-events-none fixed inset-0 z-[81] flex flex-col items-center justify-center gap-3 bg-slate-950 text-white" role="status">
              {peerMedia}
              <p className="text-sm text-slate-300">{peerName || "Participant"} turned the camera off</p>
            </div>
          )}
        </>
      )}
      {chatToast && (
        <div className="fixed right-4 top-20 z-[95] flex w-[min(360px,calc(100vw-2rem))] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-900 shadow-2xl" role="status">
          <button
            type="button"
            onClick={() => {
              setChatToast(null);
              router.push(chatToast.system === "internal"
                ? "/admin/internal-chat"
                : pathname?.startsWith("/admin") ? "/admin/chat" : "/user-dashboard/chat");
            }}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
            aria-label={`Open chat message from ${chatToast.senderName}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600"><MessageCircle size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{chatToast.senderName}</span>
              <span className="block truncate text-xs text-slate-500">{chatToast.preview}</span>
            </span>
          </button>
          <button type="button" onClick={() => setChatToast(null)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Dismiss message notification"><X size={16} /></button>
        </div>
      )}
      {callNotice && (
        <div className="fixed left-1/2 top-4 z-[96] w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800 shadow-xl" role="status" aria-live="polite">
          {callNotice}
        </div>
      )}
      {isVideoActive && (
        // The video element stays mounted while the video call is active. Its
        // srcObject is never cleared on camera toggle, so re-enabling the
        // track restores the feed immediately without remounting or re-offer.
        <div
          className={`fixed z-[84] overflow-hidden rounded-xl border border-white/20 bg-slate-800 shadow-lg ${localPosition ? "" : "bottom-20 right-4 h-28 w-40 sm:h-36 sm:w-52"}`}
          style={localPosition ? { left: localPosition.x, top: localPosition.y, width: localPosition.w, height: localPosition.h } : undefined}
          aria-label="Your camera preview"
        >
          <video ref={localVideoRef} autoPlay playsInline muted className={`h-full w-full object-cover ${cameraOn ? "block" : "hidden"}`} />
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900/90 text-white">
              {user?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700">{(user?.displayName || user?.email || "You").charAt(0).toUpperCase()}</div>
              )}
              <span className="text-[11px] text-slate-300">Camera off</span>
            </div>
          )}
          <div
            className="absolute inset-x-0 top-0 flex h-6 cursor-grab touch-none items-center justify-center bg-slate-950/60 text-white/80 active:cursor-grabbing"
            onPointerDown={(event) => handleLocalDrag(event, "move")}
            onPointerMove={handleLocalDragMove}
            onPointerUp={endLocalDrag}
            onPointerCancel={endLocalDrag}
            aria-label="Drag camera preview"
          >
            <Grip size={14} />
            <button type="button" onClick={resetLocalPosition} onPointerDown={(event) => event.stopPropagation()} className="absolute right-1 rounded p-0.5 hover:bg-white/20" aria-label="Reset camera preview position">
              <RotateCcw size={12} />
            </button>
          </div>
          <div
            className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none bg-white/30"
            onPointerDown={(event) => handleLocalDrag(event, "resize")}
            onPointerMove={handleLocalDragMove}
            onPointerUp={endLocalDrag}
            onPointerCancel={endLocalDrag}
            aria-label="Resize camera preview"
          />
        </div>
      )}
      {callState !== "idle" && minimized && (
        <div className="fixed bottom-4 right-4 z-[85] w-[min(330px,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-3 text-white shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold">
              {peerAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={peerAvatar} alt="" className="h-full w-full object-cover" />
              ) : (peerName || "User").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{peerName || "User"}</p>
              <p className="text-xs text-slate-300">{callState === "connected" ? formatDuration(duration) : isRinging ? "Ringing" : "Connecting..."}</p>
            </div>
            <button type="button" onClick={() => setMinimized(false)} className="flex min-h-10 min-w-10 items-center justify-center rounded-full p-2 hover:bg-slate-700" aria-label="Restore call"><Maximize2 size={18} /></button>
            <button type="button" onClick={endCall} disabled={busy} className="flex min-h-10 min-w-10 items-center justify-center rounded-full bg-red-500 p-2 disabled:opacity-60" aria-label="End call"><PhoneOff size={18} /></button>
          </div>
        </div>
      )}
      {callState !== "idle" && !minimized && (
        isVideoActive ? (
          // Video stays fully visible: controls float at the bottom instead of
          // covering the feeds with a centered card and dark backdrop.
          <div className="fixed inset-x-0 bottom-0 z-[85] bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-12">
            <div className="mx-auto w-full max-w-xl rounded-2xl bg-slate-900/90 p-3 text-white shadow-2xl backdrop-blur">
              {statusBlock}
            </div>
          </div>
        ) : (
          <div className={`fixed inset-0 z-[83] flex items-center justify-center p-4 ${callType === "video" ? "bg-transparent" : "bg-slate-950/60"}`}>
            <div className="w-full max-w-md rounded-3xl bg-slate-900 p-5 text-white shadow-2xl">
              {statusBlock}
            </div>
          </div>
        )
      )}
    </CallContext.Provider>
  );
}
