"use client";

import React, { useEffect, useRef, useState } from "react";
import { Paperclip, Smile, Mic, Send, X, Square, Trash2, Loader2 } from "lucide-react";

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "🤔",
  "👍", "👎", "❤️", "🔥", "🎉", "🙏", "😎", "😢",
  "😡", "✅", "❌", "⭐", "💬", "📞", "📎",
];

export default function ChatComposer({ uid, uploadUrl = "/api/user/chat/attachments", onSend, disabled = false, placeholder = "Type your message" }) {
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
  const textareaRef = useRef(null);
  const emojiRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const uploadFile = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("uid", uid);
      fd.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const data = await res.json();
      if (data.success && data.attachment) {
        setAttachments((prev) => [...prev, data.attachment]);
      } else {
        alert(data.message || "Upload failed");
      }
    } catch (e) {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) await uploadFile(f);
    e.target.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined });
      chunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
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
    } catch (e) {
      alert("Microphone permission denied or unavailable");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      clearInterval(timerRef.current);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordSeconds(0);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  };

  const sendVoice = async () => {
    if (!audioBlob) return;
    setUploading(true);
    try {
      const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: audioBlob.type });
      const fd = new FormData();
      fd.append("uid", uid);
      fd.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const data = await res.json();
      if (data.success && data.attachment) {
        await onSend({
          content: "",
          messageType: "voice",
          attachments: [data.attachment],
          voiceMetadata: { duration: recordSeconds },
          clientId: `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        });
        setAudioBlob(null);
        setAudioUrl(null);
        setRecordSeconds(0);
      } else {
        alert(data.message || "Upload failed");
      }
    } catch (e) {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    if (sending || disabled) return;
    const trimmed = text.trim();
    const hasAttachments = attachments.length > 0;
    if (!trimmed && !hasAttachments) return;
    setSending(true);
    try {
      await onSend({
        content: trimmed,
        messageType: hasAttachments ? (attachments[0].type?.startsWith("image/") ? "image" : "file") : "text",
        attachments: hasAttachments ? attachments : [],
        voiceMetadata: null,
        clientId: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      setText("");
      setAttachments([]);
    } catch (e) {
      alert("Send failed");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (em) => {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newText = text.slice(0, start) + em + text.slice(end);
      setText(newText);
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + em.length; ta.focus(); }, 0);
    } else {
      setText((t) => t + em);
    }
    setShowEmoji(false);
    setTimeout(() => emojiButtonRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!showEmoji) return undefined;
    const handlePointerDown = (event) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target)) setShowEmoji(false);
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowEmoji(false);
        emojiButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showEmoji]);

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span key={a.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
              {a.name} <button type="button" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.name}`}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {audioUrl && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 p-2">
          <audio controls src={audioUrl} className="flex-1" />
          <span className="text-xs text-slate-500">{recordSeconds}s</span>
          <button onClick={sendVoice} disabled={uploading} className="rounded-full bg-orange-500 p-2 text-white disabled:opacity-50">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
          <button onClick={cancelRecording} className="rounded-full bg-slate-200 p-2 text-slate-600"><Trash2 size={14} /></button>
        </div>
      )}

      {recording && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-red-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="text-sm font-medium">Recording... {recordSeconds}s</span>
          <button onClick={stopRecording} className="ml-auto rounded-full bg-red-500 p-2 text-white"><Square size={14} /></button>
          <button onClick={cancelRecording} className="rounded-full bg-slate-200 p-2 text-slate-600"><X size={14} /></button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Attach file">
          <Paperclip size={18} />
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />

        <div className="relative" ref={emojiRef}>
          <button ref={emojiButtonRef} type="button" onClick={() => setShowEmoji((v) => !v)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Emoji" aria-haspopup="dialog" aria-expanded={showEmoji}>
            <Smile size={18} />
          </button>
          {showEmoji && (
            <div className="emoji-picker" role="dialog" aria-label="Emoji picker">
              <div className="emoji-picker-grid">
                {EMOJIS.map((em) => (
                  <button type="button" key={em} onClick={() => insertEmoji(em)} aria-label={`Insert ${em}`} className="emoji-picker-item">
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!audioUrl && !recording && (
          <button onClick={startRecording} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Voice message">
            <Mic size={18} />
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
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
