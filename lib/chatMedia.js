// Pure helpers shared by every chat surface's media rendering.

export function isImageType(type) {
  return String(type || "").toLowerCase().startsWith("image/");
}

export function isVideoType(type) {
  return String(type || "").toLowerCase().startsWith("video/");
}

export function isAudioType(type) {
  return String(type || "").toLowerCase().startsWith("audio/");
}

// Build a flat, ordered list of viewer items from a message. The URL builder
// is supplied by the caller because customer and internal attachments use
// different authorized endpoints.
export function mediaItemsFromMessage(message, buildUrl) {
  const m = message || {};
  const attachments = Array.isArray(m.attachments) ? m.attachments : [];
  return attachments
    .filter((a) => a?.id && (isImageType(a.type) || isVideoType(a.type)))
    .map((a) => ({
      id: a.id,
      name: a.name || "Shared media",
      type: a.type,
      url: buildUrl(a),
      messageId: m.messageId || null,
      senderId: m.senderId || null,
    }));
}

export function clampZoom(zoom) {
  const value = Number(zoom);
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value * 100) / 100));
}

export function nextMediaIndex(length, current, delta) {
  if (!length) return 0;
  return ((current + delta) % length + length) % length;
}

export function formatMediaSize(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
