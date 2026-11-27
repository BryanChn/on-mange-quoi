import assert from "node:assert/strict";
import { test } from "node:test";

import { playFirstSupported } from "./haptics-rules.ts";

test("haptique : le premier effet que le téléphone sait jouer", async () => {
  const played: string[] = [];
  const play = async (effect: string) => {
    if (effect === "toggle-on") throw new Error("HapticTypeNotSupported");
    played.push(effect);
  };
  assert.equal(await playFirstSupported(["toggle-on", "virtual-key"], play), "virtual-key");
  assert.deepEqual(played, ["virtual-key"]);
});

test("haptique : l'effet moderne quand il marche, sans essayer le repli", async () => {
  const played: string[] = [];
  const result = await playFirstSupported(["confirm", "context-click"], async (effect) => {
    played.push(effect);
  });
  assert.equal(result, "confirm");
  assert.deepEqual(played, ["confirm"]);
});

test("haptique : aucun effet possible, rien ne casse", async () => {
  const result = await playFirstSupported(["confirm"], async () => {
    throw new Error("pas de moteur haptique");
  });
  assert.equal(result, null);
});
