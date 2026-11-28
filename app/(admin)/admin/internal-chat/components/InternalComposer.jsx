"use client";

import React, { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Paperclip, Smile, Mic, Send, X, Square, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { authFetch } from "@/lib/authFetch";

const EMOJIS = ["😀", "😂", "😊", "👍", "❤️", "🔥", "🎉", "🙏", "✅", "❌", "⭐", "💬"];
const MAX_FILE_SIZE = 15 * 1024 * 1024;

export default function InternalComposer({ onSend, onTyping, disabled = false }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const fileInputRef = useRef(null);
  const emojiRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const typingTimerRef = useRef(null);
  const lastTypingRef = useRef(0);

  const notifyError = (message) => Swal.fire({ toast: true, position: "top-end", icon: "error", title: message, timer: 3500, showConfirmButton: false });

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearTimeout(typingTimerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const uploadFile = async (file) => {
    if (file.size > MAX_FILE_SIZE) {
      notifyError("File size must be 15 MB or less.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch("/api/internal-chat/attachments", { method: "POST", body: fd }, user);
      const data = await res.json();
      if (data.success && data.attachment) setAttachments((prev) => [...prev, data.attachment]);
      else notifyError(data.message || "Upload failed");
    } catch {
      notifyError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) await uploadFile(file);
    e.target.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined });
      chunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data?.size > 0) chunksRef.current.push(ev.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      notifyError("Microphone permission denied or unavailable");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setRecording(false);
    clearInterval(timerRef.current);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setRecording(false);
    clearInterval(timerRef.current);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordSeconds(0);
  };

  const sendVoice = async () => {
    if (!audioBlob) return;
    setUploading(true);
    try {
      const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: audioBlob.type || "audio/webm" });
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch("/api/internal-chat/attachments", { method: "POST", body: fd }, user);
      const data = await res.json();
      if (data.success && data.attachment) {
        await onSend({ content: "", messageType: "voice", attachments: [data.attachment], voiceMetadata: { duration: recordSeconds } });
        setAudioBlob(null);
        setAudioUrl(null);
        setRecordSeconds(0);
      } else notifyError(data.message || "Upload failed");
    } catch {
      notifyError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (value) => {
    setText(value);
    const now = Date.now();
    if (now - lastTypingRef.current > 1500) {
      lastTypingRef.current = now;
      onTyping?.(true);
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => onTyping?.(false), 2200);
  };

  const handleSend = async () => {
    if (sending || disabled) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    setSending(true);
    try {
      await onSend({
        content: trimmed,
        messageType: attachments.length ? (attachments[0].type?.startsWith("image/") ? "image" : "file") : "text",
        attachments,
        voiceMetadata: null,
      });
      setText("");
      setAttachments([]);
      onTyping?.(false);
    } catch {
      notifyError("Message could not be sent");
    } finally {
      setSending(false);
    }
  };

  const insertEmoji = (emoji) => {
    setText((current) => current + emoji);
    setShowEmoji(false);
    setTimeout(() => emojiButtonRef.current?.focus(), 0);
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span key={a.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
              {a.name}
              <button type="button" onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.name}`}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {audioUrl && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 p-2">
          <audio controls src={audioUrl} className="flex-1" />
          <span className="text-xs text-slate-500">{recordSeconds}s</span>
          <button onClick={sendVoice} disabled={uploading} className="rounded-full bg-orange-500 p-2 text-white disabled:opacity-50" aria-label="Send voice message">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
          <button onClick={cancelRecording} className="rounded-full bg-slate-200 p-2 text-slate-600" aria-label="Delete recording"><Trash2 size={14} /></button>
        </div>
      )}
      {recording && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-red-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="text-sm font-medium">Recording... {recordSeconds}s</span>
          <button onClick={stopRecording} className="ml-auto rounded-full bg-red-500 p-2 text-white" aria-label="Stop recording"><Square size={14} /></button>
          <button onClick={cancelRecording} className="rounded-full bg-slate-200 p-2 text-slate-600" aria-label="Cancel recording"><X size={14} /></button>
        </div>
      )}
      <div className="flex items-end gap-1 sm:gap-2">
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Attach file"><Paperclip size={18} /></button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
        <div className="relative" ref={emojiRef}>
          <button ref={emojiButtonRef} type="button" onClick={() => setShowEmoji((v) => !v)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Emoji" aria-haspopup="dialog" aria-expanded={showEmoji}><Smile size={18} /></button>
          {showEmoji && (
            <div className="emoji-picker" role="dialog" aria-label="Emoji picker">
              <div className="emoji-picker-grid">
                {EMOJIS.map((emoji) => (
                  <button type="button" key={emoji} onClick={() => insertEmoji(emoji)} aria-label={`Insert ${emoji}`} className="emoji-picker-item">{emoji}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        {!audioUrl && !recording && (
          <button onClick={startRecording} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Voice message"><Mic size={18} /></button>
        )}
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Write a message..."
          rows={1}
          className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
        />
        <button onClick={handleSend} disabled={sending || uploading || (!text.trim() && attachments.length === 0)} className="rounded-full bg-orange-500 p-2 text-white disabled:opacity-50" aria-label="Send">
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
      {uploading && <p className="mt-1 text-xs text-slate-400">Uploading...</p>}
    </div>
  );
}
