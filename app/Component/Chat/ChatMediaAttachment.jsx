"use client";

import React from "react";
import { File, Maximize2 } from "lucide-react";
import { isImageType, isVideoType, mediaItemsFromMessage } from "@/lib/chatMedia";
import { useChatMedia } from "@/app/Component/Chat/ChatMediaLightbox";

// Shared renderer for both chat systems. Clicking an image opens the in-chat
// lightbox instead of navigating to the raw attachment URL; thumbnails have
// fixed, responsive dimensions while the viewer preserves the original ratio.
export default function ChatMediaAttachment({ message, attachment, buildUrl }) {
  const viewer = useChatMedia();
  const type = String(attachment?.type || "");
  const url = buildUrl(attachment);
  const items = mediaItemsFromMessage(message, buildUrl);
  const index = Math.max(0, items.findIndex((item) => item.id === attachment?.id));

  if (isImageType(type)) {
    return (
      <button
        type="button"
        onClick={() => viewer?.open(items, index)}
        className="chat-msg-media-button group relative block overflow-hidden rounded-lg border border-slate-200/70 bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
        aria-label={`View image ${attachment.name || ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.name || "Shared image"} loading="lazy" decoding="async" className="chat-msg-media-thumb" />
      </button>
    );
  }

  if (isVideoType(type)) {
    return (
      <div className="relative w-full max-w-[min(22rem,70vw)] overflow-hidden rounded-lg border border-slate-200/70 bg-slate-900">
        <video src={url} controls preload="metadata" className="chat-msg-media-video w-full" aria-label={attachment.name || "Shared video"} />
        {viewer && items.length > 0 && (
          <button
            type="button"
            onClick={() => viewer.open(items, index)}
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
            aria-label="Open video in fullscreen viewer"
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="chat-msg-attachment">
      <File size={14} className="shrink-0" />
      <span className="min-w-0 truncate">
        {attachment?.name} <span className="opacity-70">({Math.round((attachment?.size || 0) / 1024)}KB)</span>
      </span>
    </a>
  );
}
