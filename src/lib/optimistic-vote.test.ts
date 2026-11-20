import assert from "node:assert/strict";
import { test } from "node:test";

import { MY_VOTER_NAME, voterIdsWithMe, withMyVote } from "./optimistic-vote.ts";

const proposals = [
  { id: "pizza", hasMyVote: false, voteCount: 1, voterNames: ["Camille"] },
  { id: "tacos", hasMyVote: true, voteCount: 2, voterNames: [MY_VOTER_NAME, "Léa"] },
];

test("withMyVote : cocher ajoute le vote et « toi » en premier", () => {
  const [pizza, tacos] = withMyVote(proposals, "pizza", true);
  assert.deepEqual(pizza, {
    id: "pizza",
    hasMyVote: true,
    voteCount: 2,
    voterNames: [MY_VOTER_NAME, "Camille"],
  });
  assert.equal(tacos, proposals[1], "les autres plats ne sont pas recréés");
});

test("withMyVote : décocher retire le vote et « toi »", () => {
  const tacos = withMyVote(proposals, "tacos", false)[1];
  assert.deepEqual(tacos, { id: "tacos", hasMyVote: false, voteCount: 1, voterNames: ["Léa"] });
});

test("withMyVote : état absolu, rejouer l'action ne compte pas deux fois", () => {
  // Le serveur a déjà confirmé (liste rechargée) : React rejoue l'action sur la nouvelle liste.
  const once = withMyVote(proposals, "pizza", true);
  const twice = withMyVote(once, "pizza", true);
  assert.equal(twice[0].voteCount, 2);
  assert.equal(twice[0], once[0]);
});

test("withMyVote : plat inconnu (retiré entre-temps), rien ne change", () => {
  assert.deepEqual(withMyVote(proposals, "parti", true), proposals);
});

test("voterIdsWithMe : ajoute ou retire l'utilisateur, une seule fois", () => {
  assert.deepEqual(voterIdsWithMe(["c"], "me", true), ["c", "me"]);
  assert.deepEqual(voterIdsWithMe(["c", "me"], "me", true), ["c", "me"]);
  assert.deepEqual(voterIdsWithMe(["c", "me"], "me", false), ["c"]);
  assert.deepEqual(voterIdsWithMe([], "me", false), []);
});
