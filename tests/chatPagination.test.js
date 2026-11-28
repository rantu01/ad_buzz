import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_PAGE_SIZE,
  dedupeMessages,
  mergeOlderMessages,
  upsertMessage,
  normalizePage,
} from "../lib/chatPagination.js";

test("page size is a small recent window, not the whole history", () => {
  assert.ok(CHAT_PAGE_SIZE >= 20 && CHAT_PAGE_SIZE <= 30);
});

test("dedupeMessages keeps the first occurrence of each message", () => {
  const result = dedupeMessages([
    { messageId: "a", content: "first" },
    { messageId: "b", content: "second" },
    { messageId: "a", content: "duplicate" },
  ]);
  assert.deepEqual(result.map((m) => m.content), ["first", "second"]);
});

test("mergeOlderMessages prepends only genuinely older messages", () => {
  const current = [
    { messageId: "m2", createdAt: "2026-01-02T00:00:00.000Z" },
    { messageId: "m3", createdAt: "2026-01-03T00:00:00.000Z" },
  ];
  const older = [
    { messageId: "m0", createdAt: "2026-01-01T00:00:00.000Z" },
    { messageId: "m1", createdAt: "2026-01-01T12:00:00.000Z" },
    { messageId: "m2", createdAt: "2026-01-02T00:00:00.000Z" },
  ];
  const result = mergeOlderMessages(current, older);
  assert.deepEqual(result.map((m) => m.messageId), ["m0", "m1", "m2", "m3"]);
});

test("mergeOlderMessages dedupes optimistic messages received via SSE", () => {
  const current = [
    { messageId: "tmp_1", clientId: "c1", status: "sending" },
    { messageId: "m2" },
  ];
  const older = [{ messageId: "m0" }, { messageId: "m1" }];
  const result = mergeOlderMessages(current, older);
  assert.equal(result.length, 4);
  assert.equal(result.find((m) => m.clientId === "c1").status, "sending");
});

test("upsertMessage replaces a message in place instead of duplicating it", () => {
  const current = [{ messageId: "m1" }, { messageId: "m2" }];
  const result = upsertMessage(current, { messageId: "m1", status: "sent" });
  assert.equal(result.length, 2);
  assert.equal(result[0].status, "sent");
  assert.equal(result[1].messageId, "m2");
});

test("upsertMessage matches optimistic messages by clientId", () => {
  const current = [{ messageId: "tmp_c1", clientId: "c1", status: "sending" }];
  const result = upsertMessage(current, { messageId: "m9", clientId: "c1", status: "sent" });
  assert.equal(result.length, 1);
  assert.equal(result[0].messageId, "m9");
  assert.equal(result[0].status, "sent");
});

test("normalizePage uses server hasMore and the oldest message as cursor", () => {
  const page = normalizePage({
    messages: [
      { messageId: "m1", createdAt: "2026-01-01T00:00:00.000Z" },
      { messageId: "m2", createdAt: "2026-01-02T00:00:00.000Z" },
    ],
    hasMore: false,
  });
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, "2026-01-01T00:00:00.000Z");
});

test("normalizePage falls back to a length heuristic for legacy responses", () => {
  const messages = Array.from({ length: 25 }, (_, i) => ({ messageId: `m${i}`, createdAt: `2026-01-${i + 1}T00:00:00.000Z` }));
  const page = normalizePage({ messages });
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, messages[0].createdAt);
});
