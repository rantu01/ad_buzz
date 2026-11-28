import test from "node:test";
import assert from "node:assert/strict";
import { positionWithinViewport } from "../lib/popoverPosition.js";

const viewport = { width: 360, height: 640 };

test("picker stays within the viewport for a left-aligned incoming bubble", () => {
  const anchor = { left: 340, right: 368, top: 300, bottom: 332 };
  const pos = positionWithinViewport(anchor, 248, 52, "left", viewport);
  assert.ok(pos.left >= 8);
  assert.ok(pos.left + Math.min(248, 344) <= viewport.width - 8 + 0.001);
  assert.ok(pos.top >= 8);
  assert.ok(pos.top + 52 <= viewport.height - 8 + 0.001);
});

test("picker aligns to the right edge for an outgoing bubble", () => {
  const anchor = { left: 40, right: 68, top: 300, bottom: 332 };
  const left = positionWithinViewport(anchor, 248, 52, "left", viewport);
  const right = positionWithinViewport(anchor, 248, 52, "right", viewport);
  assert.ok(right.left < left.left);
  assert.ok(right.left >= 8);
});

test("picker opens below the anchor when there is no room above", () => {
  const anchor = { left: 100, right: 128, top: 20, bottom: 52 };
  const pos = positionWithinViewport(anchor, 160, 96, "left", viewport);
  assert.equal(pos.top, 60);
  assert.ok(pos.top + 96 <= viewport.height - 8);
});

test("picker never exceeds a very small viewport", () => {
  const anchor = { left: 2, right: 20, top: 4, bottom: 24 };
  const pos = positionWithinViewport(anchor, 400, 400, "left", { width: 200, height: 200 });
  assert.equal(pos.left, 8);
  assert.equal(pos.top, 8);
});
