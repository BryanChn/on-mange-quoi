import assert from "node:assert/strict";
import { test } from "node:test";

import { notificationTarget } from "./notification-link.ts";

const ID = "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b";

test("notificationTarget lit le vote envoyé par notify-vote", () => {
  assert.deepEqual(notificationTarget({ sessionId: ID }), { kind: "session", id: ID });
});

test("notificationTarget lit le repas envoyé par notify-meal", () => {
  assert.deepEqual(notificationTarget({ soireeId: ID }), { kind: "soiree", id: ID });
});

test("notificationTarget refuse ce qui n'est pas un identifiant", () => {
  assert.equal(notificationTarget(undefined), null);
  assert.equal(notificationTarget({}), null);
  assert.equal(notificationTarget({ sessionId: 42 }), null);
  assert.equal(notificationTarget({ sessionId: "../account" }), null);
  assert.equal(notificationTarget({ sessionId: `${ID}/extra` }), null);
  assert.equal(notificationTarget({ soireeId: "../account" }), null);
});
