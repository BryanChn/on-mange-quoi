// Rappel unique (send_vote_reminders, migration vote_reminders) sur la base locale : quels
// votes sont relancés, et jamais deux fois. L'envoi lui-même (notify-vote) est testé à part
// (messages.test.ts) ; ici, sans Vault, call_edge_function ne part pas, on lit la marque
// reminder_sent_at.
//
// Heure de référence fixe, le 15 janvier 2025 (Paris = UTC+1) : les sessions des autres
// fichiers de test, créées « maintenant », sont toutes plus récentes et restent hors fenêtre.
// Rôles : Alice owner, Bea lance le vote (organisatrice), Chloé simple membre.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { addProposal, closeSession, setVote, startSession } from "../../src/lib/votes.ts";
import {
  cleanUp,
  createGroup,
  createUser,
  reminderSentAt,
  sendVoteReminders,
  setSessionCreatedAt,
  signInAs,
  type TestUser,
} from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let bea: TestUser;
let chloe: TestUser;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  chloe = await createUser("Chloe");
});

after(cleanUp);

const MINUTE = 60 * 1000;
// La base renvoie « 2025-01-15T17:00:00+00:00 » : on compare des instants, pas des textes.
const instant = (value: string | null) => (value === null ? null : new Date(value).getTime());
// 15 janvier 2025 à l'heure de Paris donnée (hiver : UTC+1).
const parisTime = (hours: number, minutes = 0) =>
  new Date(Date.UTC(2025, 0, 15, hours - 1, minutes));

// Groupe neuf, vote lancé par Bea avec un plat, antidaté : lancé `minutesAgo` avant `at`.
async function sessionLaunched(at: Date, minutesAgo: number) {
  const groupId = await createGroup(alice, [bea, chloe]);
  await signInAs(bea);
  const sessionId = await startSession(groupId);
  assert.equal(await addProposal(sessionId, "Pizza"), true);
  await setSessionCreatedAt(sessionId, new Date(at.getTime() - minutesAgo * MINUTE));
  return sessionId;
}

describe("rappel unique", () => {
  test("1 h après le lancement, des membres n'ont rien fait : un rappel, une seule fois", async () => {
    const at = parisTime(18);
    const sessionId = await sessionLaunched(at, 70);

    assert.ok((await sendVoteReminders(at)) >= 1);
    assert.equal(instant(await reminderSentAt(sessionId)), at.getTime());

    // pg_cron repasse 10 min plus tard : la marque ne bouge pas, rien ne repart.
    await sendVoteReminders(new Date(at.getTime() + 10 * MINUTE));
    assert.equal(instant(await reminderSentAt(sessionId)), at.getTime());
  });

  test("trop tôt (30 min) ou trop tard (4 h) : pas de rappel", async () => {
    const at = parisTime(18);
    const tooEarly = await sessionLaunched(at, 30);
    const tooLate = await sessionLaunched(at, 240);

    await sendVoteReminders(at);
    assert.equal(await reminderSentAt(tooEarly), null);
    assert.equal(await reminderSentAt(tooLate), null);
  });

  test("hors de 10 h – 21 h (heure de Paris) : pas de rappel", async () => {
    const evening = parisTime(22);
    const lateSession = await sessionLaunched(evening, 70);
    assert.equal(await sendVoteReminders(evening), 0);
    assert.equal(await reminderSentAt(lateSession), null);

    const morning = parisTime(9, 30);
    const earlySession = await sessionLaunched(morning, 70);
    assert.equal(await sendVoteReminders(morning), 0);
    assert.equal(await reminderSentAt(earlySession), null);
  });

  test("tout le monde a proposé ou voté (l'organisatrice ne compte pas) : pas de rappel", async () => {
    const at = parisTime(18);
    const sessionId = await sessionLaunched(at, 70);
    // Chloé propose, Alice vote ; Bea a lancé le vote.
    await signInAs(chloe);
    assert.equal(await addProposal(sessionId, "Tacos"), true);
    await signInAs(alice);
    const { data: proposals, error } = await supabase
      .from("proposals")
      .select("id")
      .eq("session_id", sessionId)
      .limit(1);
    if (error) throw error;
    await setVote(proposals[0].id, true);

    await sendVoteReminders(at);
    assert.equal(await reminderSentAt(sessionId), null);
  });

  test("vote déjà clôturé : pas de rappel", async () => {
    const at = parisTime(18);
    const sessionId = await sessionLaunched(at, 70);
    await signInAs(bea);
    await closeSession(sessionId);

    await sendVoteReminders(at);
    assert.equal(await reminderSentAt(sessionId), null);
  });

  test("l'app ne peut ni lancer les rappels ni écrire la marque", async () => {
    const at = parisTime(18);
    const sessionId = await sessionLaunched(at, 70);
    await signInAs(chloe);

    const { error: rpcError } = await supabase.rpc("send_vote_reminders", {
      reference_time: at.toISOString(),
    });
    assert.ok(rpcError, "un membre ne doit pas pouvoir déclencher les rappels");

    // Écriture directe refusée (droits par colonne) : un membre ne bloque ni ne force un rappel.
    const { error: updateError } = await supabase
      .from("vote_sessions")
      .update({ reminder_sent_at: at.toISOString() })
      .eq("id", sessionId);
    assert.ok(updateError, "un membre ne doit pas pouvoir écrire reminder_sent_at");
    assert.equal(await reminderSentAt(sessionId), null);
  });
});
