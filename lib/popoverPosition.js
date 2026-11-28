// Pure placement helper for in-chat popovers (reaction picker, etc.).
// The viewport is injected so the clamping rules can be unit tested.
export function positionWithinViewport(anchor, width, height, align = "left", viewport = { width: 1024, height: 768 }) {
  const pad = 8;
  const vw = Math.max(1, Number(viewport.width) || 1024);
  const vh = Math.max(1, Number(viewport.height) || 768);
  const usableWidth = Math.min(Math.max(1, width), vw - pad * 2);
  const usableHeight = Math.min(Math.max(1, height), vh - pad * 2);

  let left = align === "right" ? anchor.right - usableWidth : anchor.left;
  left = Math.min(Math.max(pad, left), Math.max(pad, vw - usableWidth - pad));

  const above = anchor.top - usableHeight - pad;
  const top = above >= pad
    ? above
    : Math.min(anchor.bottom + pad, Math.max(pad, vh - usableHeight - pad));

  return { left, top };
}
