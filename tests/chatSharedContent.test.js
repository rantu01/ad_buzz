import assert from "node:assert/strict";
import test from "node:test";
import { replySnapshot, sharedContentFilter, sharedContentFromMessages } from "../lib/chatSharedContent.js";

test("shared content paginates only supported media and document attachments", () => {
  const messages = [{
    messageId: "m1",
    senderNameSnapshot: "Alex",
    messageType: "file",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    attachments: [
      { id: "image", name: "photo.png", type: "image/png", size: 12 },
      { id: "doc", name: "brief.pdf", type: "application/pdf", size: 42 },
    ],
  }];

  assert.deepEqual(sharedContentFilter("media"), {
    $or: [{ messageType: "image" }, { "attachments.type": /^video\//i }],
  });
  assert.equal(sharedContentFromMessages(messages, "media")[0].attachment.id, "image");
  assert.equal(sharedContentFromMessages(messages, "documents")[0].attachment.id, "doc");
});

test("shared links are extracted as safe HTTP(S) URLs with message metadata", () => {
  const [link] = sharedContentFromMessages([{
    messageId: "m2",
    senderNameSnapshot: "Sam",
    messageType: "text",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    content: "See https://example.com/help).",
  }], "links");

  assert.equal(link.url, "https://example.com/help");
  assert.equal(link.title, "example.com");
  assert.equal(link.senderName, "Sam");
});

test("reply snapshots retain a real message reference and concise attachment metadata", () => {
  const snapshot = replySnapshot({
    messageId: "m3",
    senderId: "u1",
    senderNameSnapshot: "Jamie",
    messageType: "file",
    content: "A document",
    attachments: [
      { id: "f1", name: "report.pdf", type: "application/pdf", data: "not copied" },
      { id: "f2", name: "other.pdf", type: "application/pdf" },
    ],
  });

  assert.deepEqual(snapshot, {
    messageId: "m3",
    senderId: "u1",
    senderNameSnapshot: "Jamie",
    messageType: "file",
    content: "A document",
    attachments: [{ id: "f1", name: "report.pdf", type: "application/pdf" }],
  });
});
