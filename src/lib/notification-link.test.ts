import assert from "node:assert/strict";
import { test } from "node:test";

import { sessionIdFromNotification } from "./notification-link.ts";

const SESSION_ID = "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b";

test("sessionIdFromNotification lit l'identifiant envoyé par notify-vote", () => {
  assert.equal(sessionIdFromNotification({ sessionId: SESSION_ID }), SESSION_ID);
});

test("sessionIdFromNotification refuse ce qui n'est pas un identifiant de vote", () => {
  assert.equal(sessionIdFromNotification(undefined), null);
  assert.equal(sessionIdFromNotification({}), null);
  assert.equal(sessionIdFromNotification({ sessionId: 42 }), null);
  assert.equal(sessionIdFromNotification({ sessionId: "../account" }), null);
  assert.equal(sessionIdFromNotification({ sessionId: `${SESSION_ID}/extra` }), null);
});
