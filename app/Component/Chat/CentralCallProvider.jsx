"use client";

// One global call provider for BOTH messaging systems:
//   system "customer"  -> System A (customer support chat, /api/chat/*)
//   system "internal"  -> System B (admin/staff chat, /api/internal-chat/*)
// Signaling stays on the existing SSE transport; no second realtime stack.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Minimize2, Phone, PhoneOff, Maximize2, MessageCircle, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import useSSE from "@/app/Component/Hooks/useSSE";
import { useNotificationSound } from "@/app/Component/Notifications/useNotificationSound";
import { authFetch } from "@/lib/authFetch";
import { isActiveConversation } from "@/lib/activeChat";
import { requestNotificationPermission, showBrowserNotification } from "@/lib/browserNotifications";

const CallContext = createContext(null);
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
const RING_TIMEOUT_MS = 30000;

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

  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(null);
  const callIdRef = useRef(null);
  const ringingTimeoutRef = useRef(null);
  const ringingRef = useRef(null);
  const ringtoneContextRef = useRef(null);
  const incomingRef = useRef(null);
  const stateRef = useRef("idle");
  const systemRef = useRef("customer");
  const callTypeRef = useRef("voice");
  const peerUidRef = useRef(null);
  const convIdRef = useRef(null);
  const remoteReadyRef = useRef(false);
  const answeredRef = useRef(false);
  const pendingIceRef = useRef([]);        // candidates received before remote SDP
  const pendingOutgoingIceRef = useRef([]); // candidates generated before callId/peer known
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const audioRef = useRef(null);

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
  }, []);

  // First user gesture: unlock WebAudio for ringtones and ask for desktop
  // notification permission once (never on page load, never repeatedly).
  useEffect(() => {
    const unlock = () => {
      const ctx = ringtoneContextRef.current;
      if (ctx?.state === "suspended") ctx.resume().catch(() => {});
      requestNotificationPermission();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchend", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchend", unlock);
    };
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
    ringingTimeoutRef.current = null;
    if (ringingRef.current) {
      clearInterval(ringingRef.current);
      ringingRef.current = null;
    }
  }, []);

  const startRingtone = useCallback(() => {
    stopRingtone();
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = ringtoneContextRef.current || new Ctx();
      ringtoneContextRef.current = ctx;
      const ring = () => {
        if (ctx.state !== "running") {
          ctx.resume().catch(() => {});
          return;
        }
        const now = ctx.currentTime;
        [0, 0.22].forEach((offset) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.0001, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.16);
        });
      };
      ring();
      ringingRef.current = setInterval(ring, 2200);
    } catch {
      // Audio is a progressive enhancement; calls still work without it.
    }
  }, [stopRingtone]);

  const cleanupMedia = useCallback(() => {
    stopRingtone();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    startedAtRef.current = null;
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    remoteReadyRef.current = false;
    pendingIceRef.current = [];
    pendingOutgoingIceRef.current = [];
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
    setDuration(0);
    setMuted(false);
    setCameraOn(true);
    setMinimized(false);
    callTypeRef.current = "voice";
    setCallType("voice");
    setState("idle");
  }, [cleanupMedia, setPendingIncoming, setState]);

  const sendSignal = useCallback(async (toUid, type, payload, cId, system = systemRef.current) => {
    if (!uid) return;
    const target = toUid || peerUidRef.current || null;
    const conversationId = convIdRef.current || undefined;
    try {
      if (system === "internal") {
        await authFetch("/api/internal-chat/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toUid: target, conversationId, callId: cId || callIdRef.current, type, payload }),
        }, user);
      } else {
        await fetch("/api/chat/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromUid: uid, toUid: target, conversationId, callId: cId || callIdRef.current, type, payload }),
        });
      }
    } catch {
      // Signaling failures are surfaced by the call state / timeout, not thrown.
    }
  }, [uid, user]);

  const updateCallStatus = useCallback(async (cId, status, dur, system = systemRef.current) => {
    if (!uid || !cId) return;
    try {
      if (system === "internal") {
        await authFetch("/api/internal-chat/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", callId: cId, status, duration: dur }),
        }, user);
      } else {
        await fetch("/api/chat/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, action: "update", callId: cId, status, duration: dur }),
        });
      }
    } catch {}
  }, [uid, user]);

  const createCallRecord = useCallback(async ({ conversationId, targetUid, type, system }) => {
    if (system === "internal") {
      const res = await authFetch("/api/internal-chat/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", conversationId, receiverId: targetUid, callType: type }),
      }, user);
      const data = await res.json();
      if (!data.success || !data.call?.callId) throw new Error(data.message || "Could not create call");
      if (data.unavailable) throw new Error("That colleague is offline right now.");
      return data.call;
    }
    const res = await fetch("/api/chat/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, conversationId, callType: type, action: "create", receiverId: targetUid }),
    });
    const data = await res.json();
    if (!data.success || !data.call?.callId) throw new Error(data.message || "Could not create call");
    return data.call;
  }, [uid, user]);

  const startConnectedTimer = useCallback(() => {
    if (startedAtRef.current) return;
    startedAtRef.current = Date.now();
    setDuration(0);
    stopRingtone();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setDuration(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);
  }, [stopRingtone]);

  const attachRemoteStream = useCallback((stream) => {
    if (!stream) return;
    if (callTypeRef.current === "video" && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
    } else if (audioRef.current) {
      audioRef.current.srcObject = stream;
    }
  }, []);

  const flushPendingIce = useCallback(async (pc) => {
    if (!pc || !pc.remoteDescription) return;
    const items = pendingIceRef.current.splice(0);
    for (const candidate of items) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  }, []);

  const flushOutgoingIce = useCallback((cId) => {
    const items = pendingOutgoingIceRef.current.splice(0);
    items.forEach((candidate) => sendSignal(peerUidRef.current, "ice", { candidate }, cId));
  }, [sendSignal]);

  const handleConnectionFailed = useCallback(() => {
    const cId = callIdRef.current;
    const system = systemRef.current;
    const wasAnswered = answeredRef.current;
    if (cId) {
      sendSignal(peerUidRef.current, wasAnswered ? "end" : "cancel", {}, cId, system);
      updateCallStatus(cId, wasAnswered ? "ended" : "missed", 0, system);
    }
    resetCall();
  }, [sendSignal, updateCallStatus, resetCall]);

  const setupPeerConnection = useCallback((remoteUid) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const cId = callIdRef.current;
      // Candidates can fire before the call record exists: buffer them.
      if (!cId || !peerUidRef.current) pendingOutgoingIceRef.current.push(event.candidate);
      else sendSignal(remoteUid || peerUidRef.current, "ice", { candidate: event.candidate }, cId);
    };
    pc.ontrack = (event) => attachRemoteStream(event.streams[0] || new MediaStream([event.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        answeredRef.current = true;
        setState("connected");
        startConnectedTimer();
      } else if (pc.connectionState === "failed") {
        handleConnectionFailed();
      } else if (pc.connectionState === "disconnected") {
        setState("connecting");
      }
    };
    return pc;
  }, [attachRemoteStream, handleConnectionFailed, sendSignal, setState, startConnectedTimer]);

  const startCall = useCallback(async ({
    conversationId,
    targetUid,
    targetName = "User",
    targetAvatar = "",
    callType = "voice",
    system = "customer",
  }) => {
    if (!uid || stateRef.current !== "idle") return;
    if (system === "internal" && !targetUid) return;
    try {
      systemRef.current = system;
      setActiveCallType(callType);
      convIdRef.current = conversationId || null;
      peerUidRef.current = targetUid || null;
      setPeerUid(targetUid || null);
      setPeerName(targetName);
      setPeerAvatar(targetAvatar || "");
      setCameraOn(callType === "video");
      setState("calling");

      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(callTypeRef.current));
      streamRef.current = stream;
      if (localVideoRef.current && callTypeRef.current === "video") localVideoRef.current.srcObject = stream;

      const pc = setupPeerConnection(targetUid);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const call = await createCallRecord({ conversationId, targetUid, type: callTypeRef.current, system });
      callIdRef.current = call.callId;
      setCallId(call.callId);
      await sendSignal(targetUid, "offer", { sdp: offer, callType: callTypeRef.current }, call.callId, system);
      // With no assigned staff the callee is unknown until their answer
      // arrives; keep candidates buffered until then (see answer handler).
      if (targetUid) flushOutgoingIce(call.callId);

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
        alert(message);
        resetCall();
      }
    }
  }, [uid, peerName, setupPeerConnection, createCallRecord, sendSignal, flushOutgoingIce, updateCallStatus, resetCall, setState, setActiveCallType]);

  const acceptCall = useCallback(async () => {
    const call = incomingRef.current;
    if (!call || !call.callId) return;
    stopRingtone();
    try {
      const system = call.system || "customer";
      systemRef.current = system;
      setActiveCallType(call.callType);
      peerUidRef.current = call.fromUid;
      convIdRef.current = call.conversationId || null;
      callIdRef.current = call.callId;
      answeredRef.current = true;

      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(callTypeRef.current));
      streamRef.current = stream;
      if (localVideoRef.current && callTypeRef.current === "video") localVideoRef.current.srcObject = stream;
      setCameraOn(callTypeRef.current === "video");

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
      setPendingIncoming(null);
      setState("connecting");

      await sendSignal(call.fromUid, "answer", { sdp: answer }, call.callId, system);
      await sendSignal(call.fromUid, "accepted", { byUid: uid }, call.callId, system);
      await updateCallStatus(call.callId, "accepted", 0, system);
      flushOutgoingIce(call.callId);
    } catch (error) {
      alert(error?.message || "Unable to answer call");
      resetCall();
    }
  }, [uid, stopRingtone, setupPeerConnection, flushPendingIce, sendSignal, updateCallStatus, flushOutgoingIce, resetCall, setPendingIncoming, setState, setActiveCallType]);

  const rejectCall = useCallback(async () => {
    const call = incomingRef.current;
    if (call) {
      stopRingtone();
      await sendSignal(call.fromUid, "reject", {}, call.callId, call.system);
      await updateCallStatus(call.callId, "rejected", 0, call.system);
    }
    resetCall();
  }, [sendSignal, updateCallStatus, stopRingtone, resetCall]);

  const endCall = useCallback(async () => {
    const cId = callIdRef.current;
    const target = peerUidRef.current;
    const system = systemRef.current;
    const wasAnswered = answeredRef.current;
    if (cId) {
      const dur = wasAnswered && startedAtRef.current
        ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
        : 0;
      await sendSignal(target, wasAnswered ? "end" : "cancel", {}, cId, system);
      await updateCallStatus(cId, wasAnswered ? "ended" : "missed", dur, system);
      if (!wasAnswered && !isActiveConversation(convIdRef.current, system)) {
        showBrowserNotification({
          id: `missed_${cId}`,
          title: "Missed call",
          body: peerName ? `Call to ${peerName} was not answered` : "Call was not answered",
          tag: `call_${cId}`,
        });
      }
    }
    resetCall();
  }, [sendSignal, updateCallStatus, resetCall, peerName]);

  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const next = !muted;
    streamRef.current.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    if (!streamRef.current) return;
    const next = !cameraOn;
    streamRef.current.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraOn(next);
  }, [cameraOn]);

  const handleSignal = useCallback((data, system) => {
    if (!data?.callId || !uid) return;
    const cId = String(data.callId);
    if (data.type === "offer") {
      if (stateRef.current !== "idle") {
        if (callIdRef.current !== cId) {
          sendSignal(data.fromUid, "reject", {}, cId, system);
          updateCallStatus(cId, "rejected", 0, system);
        }
        return;
      }
      systemRef.current = system;
      setActiveCallType(data.callType === "video" || data.payload?.callType === "video" ? "video" : "voice");
      convIdRef.current = data.conversationId || null;
      peerUidRef.current = data.fromUid;
      setPendingIncoming({
        callId: cId,
        fromUid: data.fromUid,
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
      setCameraOn(callTypeRef.current === "video");
      setState("ringing");
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
          sendSignal(data.fromUid, "missed", {}, cId, system);
          resetCall();
        }
      }, RING_TIMEOUT_MS);
    } else if (data.type === "answer") {
      if (callIdRef.current !== cId) return;
      peerUidRef.current = data.fromUid;
      setState("connecting");
      flushOutgoingIce(cId);
      const pc = pcRef.current;
      if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(data.payload?.sdp))
          .then(() => { remoteReadyRef.current = true; return flushPendingIce(pc); })
          .catch(() => handleConnectionFailed());
      }
    } else if (data.type === "ice") {
      const candidate = data.payload?.candidate;
      if (!candidate) return;
      const pc = pcRef.current;
      if (pc && remoteReadyRef.current) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingIceRef.current.push(candidate);
      }
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
        resetCall();
      }
    } else if (data.type === "accepted") {
      // Claim marker for channel-broadcast offers: only one staff keeps it.
      if (data.byUid && data.byUid !== uid && incomingRef.current?.callId === cId) resetCall();
    }
  }, [uid, sendSignal, updateCallStatus, resetCall, setPendingIncoming, startRingtone, setState, setActiveCallType, flushOutgoingIce, flushPendingIce, handleConnectionFailed]);

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
    },
  });

  // The local <video> mounts only for video calls, so attach the stream here
  // as well as at acquisition time (React may not have committed the ref yet).
  useEffect(() => {
    if (localVideoRef.current && streamRef.current && callTypeRef.current === "video") {
      localVideoRef.current.srcObject = streamRef.current;
    }
  }, [callState]);

  // Release media/timers if the provider ever unmounts (no leaked WebRTC).
  useEffect(() => () => cleanupMedia(), [cleanupMedia]);

  const contextValue = {
    callState, callId, peerUid, peerName, peerAvatar, incoming, duration, muted,
    cameraOn, minimized, callType,
    startCall, acceptCall, rejectCall, endCall, toggleMute, toggleCamera,
    minimize: () => setMinimized(true),
    restore: () => setMinimized(false),
  };

  if (!uid) return <CallContext.Provider value={contextValue}>{children}</CallContext.Provider>;

  const isRinging = callState === "ringing";
  const statusLabel = isRinging ? "Incoming call" : callState === "calling" ? "Calling..."
    : callState === "connecting" ? "Connecting..." : "Connected";
  const typeLabel = callType === "video" ? "Video call" : "Voice call";

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      <audio ref={audioRef} id="central-call-audio" autoPlay playsInline />
      <video
        ref={remoteVideoRef}
        id="central-call-remote-video"
        autoPlay
        playsInline
        className={`fixed inset-0 z-[79] h-full w-full bg-slate-950 object-contain ${callType === "video" && !minimized && (callState === "connected" || callState === "connecting") ? "block" : "hidden"}`}
      />
      {chatToast && (
        <div className="fixed right-4 top-20 z-[82] flex w-[min(360px,calc(100vw-2rem))] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-900 shadow-2xl" role="status">
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
      {callState !== "idle" && callType === "video" && !minimized && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="fixed bottom-4 right-4 z-[81] h-28 w-40 rounded-xl border border-white/20 bg-slate-800 object-cover shadow-lg sm:h-36 sm:w-52"
          aria-label="Your camera"
        />
      )}
      {callState !== "idle" && minimized && (
        <div className="fixed bottom-4 right-4 z-[80] w-[min(330px,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-3 text-white shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold">
              {peerAvatar ? <img src={peerAvatar} alt="" className="h-full w-full object-cover" /> : (peerName || "User").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{peerName || "User"}</p>
              <p className="text-xs text-slate-300">{callState === "connected" ? formatDuration(duration) : isRinging ? "Ringing" : "Connecting..."}</p>
            </div>
            <button type="button" onClick={() => setMinimized(false)} className="rounded-full p-2 hover:bg-slate-700" aria-label="Restore call"><Maximize2 size={18} /></button>
            <button type="button" onClick={endCall} className="rounded-full bg-red-500 p-2" aria-label="End call"><PhoneOff size={18} /></button>
          </div>
        </div>
      )}
      {callState !== "idle" && !minimized && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{statusLabel}</span>
              {callState === "connected" && (
                <button type="button" onClick={() => setMinimized(true)} className="rounded-full p-2 hover:bg-slate-800" aria-label="Minimize call"><Minimize2 size={18} /></button>
              )}
            </div>
            <div className="flex flex-col items-center py-6">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-2xl font-bold">
                {peerAvatar ? <img src={peerAvatar} alt="" className="h-full w-full object-cover" /> : (peerName || "User").charAt(0).toUpperCase()}
              </div>
              <p className="mt-3 text-lg font-semibold">{peerName || "User"}</p>
              <p className="mt-1 text-sm text-slate-300">
                {callState === "connected" ? formatDuration(duration) : typeLabel}
              </p>
            </div>
            <div className="flex justify-center gap-4">
              {isRinging ? (
                <>
                  <button type="button" onClick={rejectCall} className="rounded-full bg-red-500 p-4" aria-label="Reject call"><PhoneOff size={22} /></button>
                  <button type="button" onClick={acceptCall} className="rounded-full bg-green-500 p-4" aria-label="Accept call"><Phone size={22} /></button>
                </>
              ) : (
                <>
                  <button type="button" onClick={toggleMute} className={`rounded-full p-4 ${muted ? "bg-orange-500" : "bg-slate-700"}`} aria-label={muted ? "Unmute microphone" : "Mute microphone"}>
                    {muted ? <MicOff size={22} /> : <Mic size={22} />}
                  </button>
                  {callType === "video" && (
                    <button type="button" onClick={toggleCamera} className={`rounded-full p-4 ${cameraOn ? "bg-slate-700" : "bg-orange-500"}`} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}>
                      {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
                    </button>
                  )}
                  <button type="button" onClick={endCall} className="rounded-full bg-red-500 p-4" aria-label="End call"><PhoneOff size={22} /></button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}
