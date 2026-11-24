import assert from "node:assert/strict";
import { test } from "node:test";

import { capitalize, sortByMenuOrder, topicWords } from "./vote-topic.ts";

test("les phrases du vote restent justes : genre et élision selon le sujet", () => {
  const sentence = (topic: Parameters<typeof topicWords>[0]) => {
    const words = topicWords(topic);
    return `${capitalize(words.this)} est déjà proposé${words.agree}. Pas encore ${words.of}, propose ${words.first} !`;
  };
  assert.equal(
    sentence("plat"),
    "Ce plat est déjà proposé. Pas encore de plat, propose le premier !",
  );
  assert.equal(
    sentence("entree"),
    "Cette entrée est déjà proposée. Pas encore d’entrée, propose la première !",
  );
  assert.equal(
    sentence("apero"),
    "Cet apéro est déjà proposé. Pas encore d’apéro, propose le premier !",
  );
});

test("le menu dans l'ordre d'un repas : apéro, entrée, plat, dessert", () => {
  const sorted = sortByMenuOrder([
    { topic: "dessert" as const },
    { topic: "plat" as const },
    { topic: "apero" as const },
  ]);
  assert.deepEqual(
    sorted.map((item) => item.topic),
    ["apero", "plat", "dessert"],
  );
});
