// Tests d'intégration de src/lib/votes.ts sur la base locale : le vrai code de l'app,
// la vraie RLS, les vraies fonctions SQL. Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice est owner du groupe, Bea lance les votes (organisatrice), Chloé est
// simple membre, Dan n'est pas dans le groupe.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  addProposal,
  closeSession,
  fetchLatestSession,
  fetchOpenSessionId,
  fetchSession,
  getLeadingProposals,
  isSessionClosedError,
  removeProposal,
  setVote,
  startSession,
  type Proposal,
} from "../../src/lib/votes.ts";
import { createSerialQueue } from "../../src/lib/serial-queue.ts";
import { cleanUp, createGroup, createUser, signInAs, type TestUser } from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let bea: TestUser;
let chloe: TestUser;
let dan: TestUser;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  chloe = await createUser("Chloe");
  dan = await createUser("Dan");
});

after(cleanUp);

// Un groupe neuf par test : une seule session peut être ouverte par groupe.
async function newGroup(): Promise<string> {
  return createGroup(alice, [bea, chloe]);
}

// Session lancée par Bea, avec un plat par entrée de `dishes` (proposé par Bea).
async function sessionWithDishes(groupId: string, dishes: string[]) {
  await signInAs(bea);
  const sessionId = await startSession(groupId);
  for (const dish of dishes) assert.equal(await addProposal(sessionId, dish), true);

  const session = await fetchSession(sessionId);
  const idOf = (name: string) => {
    const proposal = session.proposals.find((p) => p.name === name);
    assert.ok(proposal, `plat ${name} introuvable`);
    return proposal.id;
  };
  return { sessionId, idOf };
}

async function voteAs(user: TestUser, proposalId: string) {
  await signInAs(user);
  await setVote(proposalId, true);
}

describe("lancer un vote", () => {
  test("le second lancement rejoint la session déjà ouverte au lieu d'échouer", async () => {
    const groupId = await newGroup();

    await signInAs(bea);
    const first = await startSession(groupId);
    await signInAs(chloe);
    const second = await startSession(groupId);

    assert.equal(second, first);
    assert.equal(await fetchOpenSessionId(groupId), first);
    assert.deepEqual(await fetchLatestSession(groupId), { id: first, isOpen: true });
  });

  test("un non-membre ne voit pas la session et ne peut pas en lancer", async () => {
    const groupId = await newGroup();
    const { sessionId } = await sessionWithDishes(groupId, ["Pizza"]);

    await signInAs(dan);
    assert.equal(await fetchOpenSessionId(groupId), null);
    await assert.rejects(fetchSession(sessionId));
    await assert.rejects(startSession(groupId));
  });
});

describe("proposer et retirer des plats", () => {
  test("un plat déjà proposé est refusé, sans tenir compte des majuscules", async () => {
    const groupId = await newGroup();
    const { sessionId } = await sessionWithDishes(groupId, ["Pizza"]);

    await signInAs(chloe);
    assert.equal(await addProposal(sessionId, "pizza"), false);
    assert.equal(await addProposal(sessionId, "Sushis"), true);
  });

  test("seul l'auteur retire son plat, et seulement s'il n'a aucun vote", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza", "Tacos"]);

    // Chloé ne peut pas retirer le plat de Bea : 0 ligne supprimée, sans erreur (RLS).
    await signInAs(chloe);
    assert.equal(await removeProposal(idOf("Tacos")), false);

    // Un vote bloque le retrait, même pour l'autrice.
    await voteAs(chloe, idOf("Pizza"));
    await signInAs(bea);
    assert.equal(await removeProposal(idOf("Pizza")), false);
    assert.equal(await removeProposal(idOf("Tacos")), true);

    const names = (await fetchSession(sessionId)).proposals.map((p) => p.name);
    assert.deepEqual(names, ["Pizza"]);
  });
});

describe("voter", () => {
  test("cocher deux fois ne compte qu'un vote, décocher le retire", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza"]);

    await signInAs(chloe);
    await setVote(idOf("Pizza"), true);
    await setVote(idOf("Pizza"), true);
    let pizza = (await fetchSession(sessionId)).proposals[0];
    assert.equal(pizza.voteCount, 1);
    assert.equal(pizza.hasMyVote, true);

    await setVote(idOf("Pizza"), false);
    pizza = (await fetchSession(sessionId)).proposals[0];
    assert.equal(pizza.voteCount, 0);
    assert.equal(pizza.hasMyVote, false);
  });

  test("la session vue par chacun : votants, auteur, participation, droit de clôture", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza"]);
    await voteAs(chloe, idOf("Pizza"));
    await voteAs(alice, idOf("Pizza"));

    // Vue de Chloé : « toi » en premier, puis les autres par ordre alphabétique.
    await signInAs(chloe);
    const forChloe = await fetchSession(sessionId);
    assert.deepEqual(forChloe.proposals[0].voterNames, ["toi", "Alice"]);
    assert.equal(forChloe.proposals[0].isMine, false);
    assert.equal(forChloe.organizerName, "Bea");
    assert.equal(forChloe.participation.votedCount, 2);
    assert.equal(forChloe.participation.memberCount, 3);
    assert.equal(forChloe.canClose, false);
    assert.equal(forChloe.isOpen, true);

    // Bea a proposé le plat et organise ; Alice est owner : toutes deux peuvent clôturer.
    await signInAs(bea);
    const forBea = await fetchSession(sessionId);
    assert.equal(forBea.proposals[0].isMine, true);
    assert.equal(forBea.canClose, true);
    await signInAs(alice);
    assert.equal((await fetchSession(sessionId)).canClose, true);
  });
});

// Ce que fait l'écran du vote (vote optimiste) : chaque toucher part dans la file sans
// attendre le précédent. Le vrai serveur doit finir dans l'état du dernier toucher.
describe("votes rapides (file d'envoi de l'écran)", () => {
  test("cinq touchers sans attendre : coché, comme le dernier toucher", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza"]);
    await signInAs(chloe);
    const enqueue = createSerialQueue();

    const touches = [true, false, true, false, true];
    await Promise.all(touches.map((want) => enqueue(() => setVote(idOf("Pizza"), want))));

    const pizza = (await fetchSession(sessionId)).proposals[0];
    assert.equal(pizza.hasMyVote, true);
    assert.equal(pizza.voteCount, 1);
  });

  test("six touchers sans attendre : décoché, et la participation suit", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza", "Tacos"]);
    await signInAs(chloe);
    const enqueue = createSerialQueue();

    // Pizza : coché puis décoché trois fois ; Tacos : coché une fois, au milieu.
    await Promise.all([
      enqueue(() => setVote(idOf("Pizza"), true)),
      enqueue(() => setVote(idOf("Pizza"), false)),
      enqueue(() => setVote(idOf("Tacos"), true)),
      enqueue(() => setVote(idOf("Pizza"), true)),
      enqueue(() => setVote(idOf("Pizza"), false)),
      enqueue(() => setVote(idOf("Tacos"), false)),
    ]);

    const session = await fetchSession(sessionId);
    assert.deepEqual(
      session.proposals.map((p) => [p.name, p.hasMyVote, p.voteCount]),
      [
        ["Pizza", false, 0],
        ["Tacos", false, 0],
      ],
    );
    assert.equal(session.voterIds.includes(session.userId), false);
  });

  test("après la clôture : cocher est refusé sans bloquer la file, décocher ne retire rien", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza", "Tacos"]);
    await voteAs(chloe, idOf("Pizza"));
    await signInAs(bea);
    await closeSession(sessionId);

    await signInAs(chloe);
    const enqueue = createSerialQueue();
    // Décocher : la RLS de suppression ne voit plus la ligne (session close), le DELETE
    // touche 0 ligne et le trigger de verrou ne se déclenche pas. Pas d'erreur, mais rien
    // n'est retiré : l'écran recharge ensuite et affiche le résultat.
    const unvote = enqueue(() => setVote(idOf("Pizza"), false));
    // Cocher : le trigger de verrou refuse, avec l'erreur que l'app reconnaît.
    const vote = enqueue(() => setVote(idOf("Tacos"), true));
    const next = enqueue(async () => "suite");

    await unvote;
    await assert.rejects(vote, (error) => isSessionClosedError(error));
    assert.equal(await next, "suite");

    const proposals = (await fetchSession(sessionId)).proposals;
    assert.deepEqual(
      proposals.map((p) => [p.name, p.voteCount]),
      [
        ["Pizza", 1],
        ["Tacos", 0],
      ],
    );
  });
});

describe("clôturer", () => {
  test("un gagnant unique clôture la session, désigné par le vote", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza", "Tacos"]);
    await voteAs(alice, idOf("Pizza"));
    await voteAs(chloe, idOf("Pizza"));
    await voteAs(chloe, idOf("Tacos"));

    await signInAs(bea);
    await closeSession(sessionId);

    const session = await fetchSession(sessionId);
    assert.equal(session.isOpen, false);
    assert.equal(session.winnerProposalId, idOf("Pizza"));
    assert.equal(session.decidedBy, "vote");
    assert.ok(session.closedAt);
    assert.deepEqual(await fetchLatestSession(groupId), {
      id: sessionId,
      isOpen: false,
      winnerName: "Pizza",
    });
  });

  test("un simple membre ne peut pas clôturer, l'owner le peut", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza"]);
    await voteAs(chloe, idOf("Pizza"));

    await signInAs(chloe);
    await assert.rejects(closeSession(sessionId), { code: "42501" });

    await signInAs(alice);
    await closeSession(sessionId);
    assert.equal((await fetchSession(sessionId)).isOpen, false);
  });

  test("une session sans plat ne se clôture pas", async () => {
    const groupId = await newGroup();
    const { sessionId } = await sessionWithDishes(groupId, []);

    await assert.rejects(closeSession(sessionId), { code: "22023" });
  });

  test("clôturer une session déjà close revient au même résultat", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza"]);
    await voteAs(chloe, idOf("Pizza"));

    await signInAs(bea);
    await closeSession(sessionId);
    await assert.doesNotReject(closeSession(sessionId));
  });

  test("après la clôture, voter ou proposer est refusé avec une erreur reconnaissable", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza"]);
    await voteAs(chloe, idOf("Pizza"));
    await signInAs(bea);
    await closeSession(sessionId);

    await signInAs(alice);
    await assert.rejects(setVote(idOf("Pizza"), true), (error) => isSessionClosedError(error));
    await assert.rejects(addProposal(sessionId, "Sushis"), (error) => isSessionClosedError(error));
  });
});

describe("égalité : toujours tirée au sort, personne ne choisit", () => {
  test("une égalité clôture la session par tirage parmi les ex æquo", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza", "Tacos", "Sushis"]);
    await voteAs(chloe, idOf("Pizza"));
    await voteAs(alice, idOf("Tacos"));

    await signInAs(bea);
    await closeSession(sessionId);

    const session = await fetchSession(sessionId);
    assert.equal(session.isOpen, false);
    assert.equal(session.decidedBy, "tirage");
    assert.ok([idOf("Pizza"), idOf("Tacos")].includes(session.winnerProposalId ?? ""));
  });

  test("aucun vote : tirage parmi tous les plats", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza", "Tacos"]);

    await closeSession(sessionId);

    const session = await fetchSession(sessionId);
    assert.equal(session.decidedBy, "tirage");
    assert.ok([idOf("Pizza"), idOf("Tacos")].includes(session.winnerProposalId ?? ""));
  });

  test("le choix manuel est refusé par le serveur, même envoyé à la main", async () => {
    const groupId = await newGroup();
    const { sessionId, idOf } = await sessionWithDishes(groupId, ["Pizza", "Tacos"]);
    await voteAs(chloe, idOf("Pizza"));
    await voteAs(alice, idOf("Tacos"));

    // Requête fabriquée, comme le ferait un ancien APK ou un client modifié.
    await signInAs(bea);
    const { error } = await supabase.rpc("close_session", {
      target_session_id: sessionId,
      method: "organisateur",
      chosen_proposal_id: idOf("Tacos"),
    });

    assert.equal(error?.code, "22023");
    assert.equal((await fetchSession(sessionId)).isOpen, true);
  });
});

describe("getLeadingProposals (logique pure)", () => {
  const dish = (name: string, voteCount: number): Proposal => ({
    id: name,
    name,
    voteCount,
    hasMyVote: false,
    isMine: false,
    voterNames: [],
  });

  test("garde le plat qui a le plus de votes", () => {
    const leading = getLeadingProposals([dish("Pizza", 2), dish("Tacos", 1)]);
    assert.deepEqual(
      leading.map((p) => p.name),
      ["Pizza"],
    );
  });

  test("garde tous les ex æquo, et tous les plats quand personne n'a voté", () => {
    const tied = getLeadingProposals([dish("Pizza", 1), dish("Tacos", 1), dish("Sushis", 0)]);
    assert.deepEqual(
      tied.map((p) => p.name),
      ["Pizza", "Tacos"],
    );
    const noVote = getLeadingProposals([dish("Pizza", 0), dish("Tacos", 0)]);
    assert.equal(noVote.length, 2);
  });
});
