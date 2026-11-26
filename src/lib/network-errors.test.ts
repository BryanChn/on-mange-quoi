import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyError,
  errorMessage,
  failureMessage,
  isRetryable,
  loadErrorMessage,
  withRetry,
} from "./network-errors.ts";

test("reconnaître la cause d'une erreur", () => {
  // Les formes réelles de supabase-js.
  assert.equal(
    classifyError({ message: "TypeError: Network request failed", code: "" }),
    "unreachable",
  );
  assert.equal(classifyError(new TypeError("Failed to fetch")), "unreachable");
  assert.equal(
    classifyError({ name: "AuthRetryableFetchError", message: "fetch failed", status: 0 }),
    "unreachable",
  );
  assert.equal(classifyError({ message: "JWT expired", code: "PGRST301" }), "session");
  assert.equal(
    classifyError({ name: "AuthApiError", message: "Invalid Refresh Token", status: 400 }),
    "session",
  );
  assert.equal(classifyError({ message: "upstream connect error", status: 503 }), "server");
  assert.equal(classifyError({ message: "duplicate key value", code: "23505" }), "other");
  assert.equal(classifyError("bizarre"), "other");
});

test("réessayer seulement ce qui peut passer tout seul", () => {
  assert.equal(isRetryable(new TypeError("Network request failed")), true);
  assert.equal(isRetryable({ message: "Bad gateway", status: 502 }), true);
  assert.equal(isRetryable({ message: "JWT expired", code: "PGRST301" }), false);
  assert.equal(isRetryable({ message: "duplicate key value", code: "23505" }), false);
});

test("withRetry : une coupure courte passe inaperçue", async () => {
  const waits: number[] = [];
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("Network request failed");
      return "profil";
    },
    [1000, 2000, 4000],
    async (ms) => {
      waits.push(ms);
    },
  );
  assert.equal(result, "profil");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test("withRetry : abandonne après le dernier délai, avec la dernière erreur", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new TypeError(`Network request failed ${calls}`);
      },
      [1, 2, 4],
      async () => {},
    ),
    /failed 4/,
  );
  assert.equal(calls, 4);
});

test("withRetry : une session expirée ne se réessaie pas", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw { message: "JWT expired", code: "PGRST301" };
      },
      [1, 2, 4],
      async () => {},
    ),
  );
  assert.equal(calls, 1);
});

test("un message par cause, qui ne dit pas « vérifie ta connexion » quand Internet marche", () => {
  assert.match(errorMessage("unreachable"), /données mobiles/);
  assert.match(errorMessage("session"), /reconnecte-toi/);
  assert.doesNotMatch(errorMessage("server"), /connexion/);
});

test("un message d'action dit ce qui a raté, puis la vraie cause", () => {
  assert.equal(
    failureMessage("Le vote n’a pas démarré", new TypeError("Network request failed")),
    "Le vote n’a pas démarré : le serveur ne répond pas sur ce réseau. Réessaie, ou passe en données mobiles.",
  );
  assert.match(
    failureMessage("Ton vote n’est pas passé", { message: "JWT expired", code: "PGRST301" }),
    /session a expiré/,
  );
  assert.match(
    failureMessage("L’article n’a pas été ajouté", { status: 503, message: "x" }),
    /pour l’instant/,
  );
  assert.equal(
    failureMessage("Ce n’est pas retiré", { code: "23505" }),
    "Ce n’est pas retiré : réessaie dans un instant.",
  );
  assert.doesNotMatch(failureMessage("X", new Error("?")), /vérifie ta connexion/);
  assert.match(loadErrorMessage(new TypeError("Failed to fetch")), /données mobiles/);
});
