import test from "node:test";
import assert from "node:assert/strict";
import {
  isImageType,
  isVideoType,
  isAudioType,
  mediaItemsFromMessage,
  clampZoom,
  nextMediaIndex,
} from "../lib/chatMedia.js";

test("media type detection covers images, videos and audio", () => {
  assert.equal(isImageType("image/png"), true);
  assert.equal(isVideoType("VIDEO/MP4"), true);
  assert.equal(isAudioType("audio/webm"), true);
  assert.equal(isImageType("application/pdf"), false);
});

test("media items preserve message order and use the supplied authorized URL", () => {
  const message = {
    messageId: "msg_1",
    senderId: "u1",
    attachments: [
      { id: "a1", name: "one.png", type: "image/png" },
      { id: "a2", name: "doc.pdf", type: "application/pdf" },
      { id: "a3", name: "clip.mp4", type: "video/mp4" },
    ],
  };
  const items = mediaItemsFromMessage(message, (a) => `/attachments/${a.id}`);
  assert.equal(items.length, 2);
  assert.equal(items[0].url, "/attachments/a1");
  assert.equal(items[1].messageId, "msg_1");
});

test("viewer helpers clamp zoom and wrap navigation", () => {
  assert.equal(clampZoom(0.2), 1);
  assert.equal(clampZoom(99), 5);
  assert.equal(nextMediaIndex(3, 2, 1), 0);
  assert.equal(nextMediaIndex(3, 0, -1), 2);
  assert.equal(nextMediaIndex(0, 0, 1), 0);
});
