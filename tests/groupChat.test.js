import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGroupName,
  validateGroupCreate,
  isGroupConversation,
  isGroupAdmin,
  canManageGroup,
  canRemoveMember,
  canLeaveGroup,
  normalizeEmoji,
  toggleReaction,
  reactionSummary,
  ALLOWED_REACTIONS,
} from "../lib/groupChat.js";

test("group creation validates the name and deduplicates members", () => {
  assert.equal(normalizeGroupName("  Team   Alpha  "), "Team Alpha");
  const result = validateGroupCreate({ name: "Team", actorUid: "me", memberUids: ["a", "b", "a", "me"] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.members, ["me", "a", "b"]);
  assert.equal(validateGroupCreate({ name: "  ", actorUid: "me", memberUids: ["a"] }).ok, false);
  assert.equal(validateGroupCreate({ name: "Team", actorUid: "me", memberUids: ["me"] }).ok, false);
});

test("group permissions restrict management to admins and protect the creator", () => {
  const conv = {
    type: "group",
    participants: ["creator", "admin2", "member"],
    admins: ["creator", "admin2"],
    createdBy: "creator",
  };
  assert.equal(isGroupConversation(conv), true);
  assert.equal(isGroupAdmin(conv, "admin2"), true);
  assert.equal(canManageGroup(conv, "member"), false);
  assert.equal(canRemoveMember(conv, "admin2", "member"), true);
  assert.equal(canRemoveMember(conv, "admin2", "creator"), false);
  assert.equal(canLeaveGroup(conv, "member"), true);
  assert.equal(canLeaveGroup(conv, "creator"), false);
});

test("reactions toggle per user and summarise by emoji", () => {
  assert.equal(normalizeEmoji("👍"), "👍");
  assert.equal(normalizeEmoji("💡"), "");
  assert.equal(ALLOWED_REACTIONS.length > 0, true);
  const once = toggleReaction([], "u1", "👍");
  const twice = toggleReaction(once, "u1", "👍");
  assert.equal(once.length, 1);
  assert.equal(twice.length, 0);
  const summary = reactionSummary([{ uid: "u1", emoji: "❤️" }, { uid: "u2", emoji: "❤️" }]);
  assert.equal(summary[0].count, 2);
});
