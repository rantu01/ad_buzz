"use client";

import React from "react";
import { Phone, PhoneMissed, PhoneOff, Video } from "lucide-react";

function label(call) {
  if (call.status === "missed") return "Missed call";
  if (call.status === "rejected") return "Call rejected";
  return "Call ended";
}

function duration(call) {
  const seconds = Number(call.duration) || 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function CallHistoryPanel({ calls = [], loading = false }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">Call history</h3>
      {loading ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      ) : calls.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">No calls in this conversation yet.</p>
      ) : (
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
          {calls.map((call) => {
            const Icon = call.callType === "video" ? Video
              : call.status === "missed" ? PhoneMissed
              : call.status === "rejected" ? PhoneOff : Phone;
            const missed = call.status === "missed" || call.status === "rejected";
            return (
              <div key={call.callId} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${missed ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600"}`}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800">{label(call)}</p>
                  <p className="text-[11px] text-slate-400">
                    {call.callType === "video" ? "Video" : "Voice"} · {new Date(call.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {!missed && <span className="font-mono text-[11px] text-slate-500">{duration(call)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
