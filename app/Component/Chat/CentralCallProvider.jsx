"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Minimize2, Phone, PhoneOff, Maximize2, MessageCircle, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import useSSE from "@/app/Component/Hooks/useSSE";
import { useNotificationSound } from "@/app/Component/Notifications/useNotificationSound";

const CallContext = createContext(null);
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function audioConstraints() {
  return { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false };
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
  const [minimized, setMinimized] = useState(false);
  const [chatToast, setChatToast] = useState(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(null);
  const callIdRef = useRef(null);
  const ringingRef = useRef(null);
  const ringtoneContextRef = useRef(null);
  const ringingTimeoutRef = useRef(null);
  const incomingRef = useRef(null);
  const stateRef = useRef("idle");

  useEffect(() => { stateRef.current = callState; }, [callState]);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);
  useEffect(() => {
    const unlock = () => {
      const ctx = ringtoneContextRef.current;
      if (ctx?.state === "suspended") ctx.resume().catch(() => {});
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
    } catch {}
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
  }, [stopRingtone]);

  const resetCall = useCallback(() => {
    cleanupMedia();
    callIdRef.current = null;
    setCallId(null);
    setPeerUid(null);
    setPeerName("");
    setPeerAvatar("");
    setIncoming(null);
    setDuration(0);
    setMuted(false);
    setMinimized(false);
    setCallState("idle");
  }, [cleanupMedia]);

  const sendSignal = useCallback(async (toUid, type, payload, cId) => {
    if (!uid) return;
    try {
      await fetch("/api/chat/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUid: uid, toUid, callId: cId || callIdRef.current, type, payload }),
      });
    } catch {}
  }, [uid]);

  const updateCallStatus = useCallback(async (cId, status, dur) => {
    if (!uid || !cId) return;
    try {
      await fetch("/api/chat/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, action: "update", callId: cId, status, duration: dur }),
      });
    } catch {}
  }, [uid]);

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

  const startCall = useCallback(async ({ conversationId, targetUid, targetName = "User", targetAvatar = "" }) => {
    if (!uid || !targetUid || stateRef.current !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints());
      streamRef.current = stream;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (event) => {
        const audio = document.getElementById("central-call-audio");
        if (audio && event.streams[0]) audio.srcObject = event.streams[0];
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) sendSignal(targetUid, "ice", { candidate: event.candidate }, callIdRef.current);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setCallState("connected");
          startConnectedTimer();
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch("/api/chat/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, conversationId, callType: "voice", action: "create", receiverId: targetUid }),
      });
      const data = await res.json();
      if (!data.success || !data.call?.callId) throw new Error("Could not create call");
      callIdRef.current = data.call.callId;
      setCallId(data.call.callId);
      setPeerUid(targetUid);
      setPeerName(targetName);
      setPeerAvatar(targetAvatar);
      setCallState("calling");
      await sendSignal(targetUid, "offer", { sdp: offer }, data.call.callId);
      ringingTimeoutRef.current = setTimeout(() => {
        if (stateRef.current === "calling") {
          updateCallStatus(callIdRef.current, "missed");
          sendSignal(targetUid, "missed", {}, callIdRef.current);
          resetCall();
        }
      }, 30000);
    } catch (error) {
      alert(error?.message || "Unable to start voice call");
      resetCall();
    }
  }, [uid, sendSignal, updateCallStatus, resetCall, startConnectedTimer]);

  const acceptCall = useCallback(async () => {
    const call = incomingRef.current;
    if (!call) return;
    stopRingtone();
    try {
      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints());
      streamRef.current = stream;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (event) => {
        const audio = document.getElementById("central-call-audio");
        if (audio && event.streams[0]) audio.srcObject = event.streams[0];
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) sendSignal(call.fromUid, "ice", { candidate: event.candidate }, call.callId);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setCallState("connected");
          startConnectedTimer();
          updateCallStatus(call.callId, "accepted");
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription(call.payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      callIdRef.current = call.callId;
      setCallId(call.callId);
      setPeerUid(call.fromUid);
      setPeerName(call.fromName || "User");
      setPeerAvatar(call.fromAvatar || "");
      setIncoming(null);
      setCallState("connected");
      await sendSignal(call.fromUid, "answer", { sdp: answer }, call.callId);
    } catch (error) {
      alert(error?.message || "Unable to answer call");
      resetCall();
    }
  }, [sendSignal, updateCallStatus, startConnectedTimer, stopRingtone, resetCall]);

  const rejectCall = useCallback(async () => {
    const call = incomingRef.current;
    if (call) {
      stopRingtone();
      await sendSignal(call.fromUid, "reject", {}, call.callId);
      await updateCallStatus(call.callId, "rejected");
    }
    resetCall();
  }, [sendSignal, updateCallStatus, stopRingtone, resetCall]);

  const endCall = useCallback(async () => {
    const cId = callIdRef.current;
    const target = peerUid;
    const wasConnected = stateRef.current === "connected";
    if (cId) {
      const dur = wasConnected && startedAtRef.current
        ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
        : 0;
      await sendSignal(target, wasConnected ? "end" : "cancel", {}, cId);
      await updateCallStatus(cId, wasConnected ? "ended" : "missed", dur);
    }
    resetCall();
  }, [peerUid, sendSignal, updateCallStatus, resetCall]);

  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const next = !muted;
    streamRef.current.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }, [muted]);

  useSSE({
    uid,
    channels: [],
    onEvent: (type, data) => {
      if (type === "chat:message" && data?.message?.senderId !== uid) {
        playFor({ _id: data.message.messageId, read: false });
        setChatToast({
          id: data.message.messageId,
          senderName: data.message.senderNameSnapshot || "New message",
          preview: data.message.content || (data.message.messageType === "voice" ? "Voice message" : "Attachment"),
          conversationId: data.conversationId,
        });
        setTimeout(() => setChatToast((current) => current?.id === data.message.messageId ? null : current), 6000);
      }
      if (type !== "chat:signal") return;
      if (!data) return;
      if (data.type === "offer") {
        if (stateRef.current !== "idle") {
          sendSignal(data.fromUid, "reject", {}, data.callId);
          updateCallStatus(data.callId, "rejected");
          return;
        }
        setIncoming({ callId: data.callId, fromUid: data.fromUid, fromName: data.fromName, fromAvatar: data.payload?.avatar || "", payload: data.payload });
        setPeerUid(data.fromUid);
        setPeerName(data.fromName || "User");
        setPeerAvatar(data.payload?.avatar || "");
        setCallState("ringing");
        startRingtone();
        ringingTimeoutRef.current = setTimeout(() => {
          if (stateRef.current === "ringing") {
            updateCallStatus(data.callId, "missed");
            sendSignal(data.fromUid, "missed", {}, data.callId);
            resetCall();
          }
        }, 30000);
      } else if (data.type === "answer") {
        if (callIdRef.current !== data.callId) return;
        const pc = pcRef.current;
        if (pc) {
          pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp))
            .then(() => setCallState("connected"))
            .catch(() => {});
        }
      } else if (data.type === "ice") {
        if (pcRef.current && data.payload?.candidate) {
          pcRef.current.addIceCandidate(new RTCIceCandidate(data.payload.candidate)).catch(() => {});
        }
      } else if (data.type === "end" || data.type === "cancel" || data.type === "reject" || data.type === "missed") {
        if (callIdRef.current === data.callId || incomingRef.current?.callId === data.callId) resetCall();
      }
    },
  });

  useEffect(() => () => cleanupMedia(), [cleanupMedia]);

  const contextValue = {
    callState, callId, peerUid, peerName, peerAvatar, incoming, duration, muted, minimized,
    startCall, acceptCall, rejectCall, endCall, toggleMute,
    minimize: () => setMinimized(true),
    restore: () => setMinimized(false),
  };

  if (!uid) return <CallContext.Provider value={contextValue}>{children}</CallContext.Provider>;

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      <audio id="central-call-audio" autoPlay playsInline />
      {chatToast && (
        <div className="fixed right-4 top-20 z-[75] flex w-[min(360px,calc(100vw-2rem))] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-900 shadow-2xl" role="status">
          <button
            type="button"
            onClick={() => {
              setChatToast(null);
              router.push(pathname?.startsWith("/admin") ? "/admin/chat" : "/user-dashboard/chat");
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
      {callState !== "idle" && minimized && (
        <div className="fixed bottom-4 right-4 z-[80] w-[min(330px,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-3 text-white shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold">
              {peerAvatar ? <img src={peerAvatar} alt="" className="h-full w-full object-cover" /> : (peerName || "User").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{peerName || "User"}</p>
              <p className="text-xs text-slate-300">{callState === "connected" ? formatDuration(duration) : callState === "ringing" ? "Ringing" : "Calling..."}</p>
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
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{callState === "ringing" ? "Incoming call" : callState === "calling" ? "Calling..." : "Connected"}</span>
              {callState === "connected" && (
                <button type="button" onClick={() => setMinimized(true)} className="rounded-full p-2 hover:bg-slate-800" aria-label="Minimize call"><Minimize2 size={18} /></button>
              )}
            </div>
            <div className="flex flex-col items-center py-6">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-2xl font-bold">
                {peerAvatar ? <img src={peerAvatar} alt="" className="h-full w-full object-cover" /> : (peerName || "User").charAt(0).toUpperCase()}
              </div>
              <p className="mt-3 text-lg font-semibold">{peerName || "User"}</p>
              <p className="mt-1 text-sm text-slate-300">{callState === "connected" ? formatDuration(duration) : callState === "ringing" ? "Voice call" : "Voice call"}</p>
            </div>
            <div className="flex justify-center gap-4">
              {callState === "ringing" ? (
                <>
                  <button type="button" onClick={rejectCall} className="rounded-full bg-red-500 p-4" aria-label="Reject call"><PhoneOff size={22} /></button>
                  <button type="button" onClick={acceptCall} className="rounded-full bg-green-500 p-4" aria-label="Accept call"><Phone size={22} /></button>
                </>
              ) : (
                <>
                  {callState === "connected" && (
                    <button type="button" onClick={toggleMute} className={`rounded-full p-4 ${muted ? "bg-orange-500" : "bg-slate-700"}`} aria-label={muted ? "Unmute microphone" : "Mute microphone"}>
                      {muted ? <MicOff size={22} /> : <Mic size={22} />}
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
