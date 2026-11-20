import assert from "node:assert/strict";
import { test } from "node:test";

import { createSerialQueue } from "./serial-queue.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Faux serveur : enregistre le dernier état reçu, après un délai propre à chaque requête
// (le réseau ne garantit pas que la première requête partie arrive la première).
function fakeServer() {
  const server = { hasMyVote: false };
  const send = async (wantVote: boolean, delayMs: number) => {
    await wait(delayMs);
    server.hasMyVote = wantVote;
  };
  return { server, send };
}

test("contre-épreuve : sans file, une requête lente arrive après la suivante", async () => {
  const { server, send } = fakeServer();
  // Cocher (réseau lent), puis décocher (réseau rapide) : l'utilisateur veut « décoché ».
  await Promise.all([send(true, 30), send(false, 0)]);
  assert.equal(server.hasMyVote, true, "le bug que la file évite : l'état final est faux");
});

test("avec la file, le serveur reçoit les votes dans l'ordre des touchers", async () => {
  const { server, send } = fakeServer();
  const enqueue = createSerialQueue();
  await Promise.all([enqueue(() => send(true, 30)), enqueue(() => send(false, 0))]);
  assert.equal(server.hasMyVote, false);
});

test("une tâche ne démarre qu'à la fin de la précédente", async () => {
  const enqueue = createSerialQueue();
  const events: string[] = [];
  const task = (name: string, delayMs: number) => async () => {
    events.push(`début ${name}`);
    await wait(delayMs);
    events.push(`fin ${name}`);
    return name;
  };

  const results = await Promise.all([enqueue(task("A", 20)), enqueue(task("B", 0))]);
  assert.deepEqual(events, ["début A", "fin A", "début B", "fin B"]);
  assert.deepEqual(results, ["A", "B"]);
});

test("un échec est rendu à son appelant, sans bloquer la suite", async () => {
  const enqueue = createSerialQueue();
  const failing = enqueue(async () => {
    throw new Error("réseau coupé");
  });
  const next = enqueue(async () => "envoyé");

  await assert.rejects(failing, /réseau coupé/);
  assert.equal(await next, "envoyé");
});

test("dix touchers rapides : l'état final est celui du dernier", async () => {
  const { server, send } = fakeServer();
  const enqueue = createSerialQueue();
  const touches = [true, false, true, false, true, false, true, false, true, false];
  // Délais décroissants : sans file, la première requête arriverait la dernière.
  await Promise.all(touches.map((want, index) => enqueue(() => send(want, 10 - index))));
  assert.equal(server.hasMyVote, false);
});
