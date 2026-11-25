// Rappel du jour d'un repas chez quelqu'un (send_meal_day_reminders, migration
// meal_ordered_and_day) sur la base locale : quels repas sont rappelés, et jamais deux fois.
// Le message (notify-meal) est testé à part (events.test.ts) ; ici, sans Vault,
// call_edge_function ne part pas, on lit la marque meal_day_reminded_at.
//
// Dates fixes en janvier 2025 (Paris = UTC+1) : les repas des autres fichiers sont datés de
// 2026 et ne sont jamais concernés.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { createSoiree } from "../../src/lib/soirees.ts";
import {
  cleanUp,
  createUser,
  mealDayRemindedAt,
  sendMealDayReminders,
  setMealDates,
  signInAs,
  type TestUser,
} from "./fixtures.ts";

let alice: TestUser;

before(async () => {
  alice = await createUser("Alice");
});

after(cleanUp);

const instant = (value: string | null) => (value === null ? null : new Date(value).getTime());
// Janvier 2025 à l'heure de Paris donnée (hiver : UTC+1).
const parisTime = (day: number, hours: number, minutes = 0) =>
  new Date(Date.UTC(2025, 0, day, hours - 1, minutes));

async function meal(mode: "commande" | "resto" | "maison"): Promise<string> {
  await signInAs(alice);
  const { id } = await createSoiree({ name: "Noël à Soultz", mode, topics: [], date: null });
  return id;
}

describe("rappel du jour d'un repas", () => {
  test("le jour du repas à 10 h, une seule fois", async () => {
    const id = await meal("maison");
    await setMealDates(id, "2025-01-15", parisTime(10, 18));

    assert.equal(await mealDayRemindedAt(id), null);
    await sendMealDayReminders(parisTime(15, 9, 50));
    assert.equal(await mealDayRemindedAt(id), null);

    assert.ok((await sendMealDayReminders(parisTime(15, 10))) >= 1);
    assert.equal(instant(await mealDayRemindedAt(id)), parisTime(15, 10).getTime());

    await sendMealDayReminders(parisTime(15, 10, 15));
    assert.equal(instant(await mealDayRemindedAt(id)), parisTime(15, 10).getTime());
  });

  test("pas la veille, pas le soir après 21 h", async () => {
    const id = await meal("maison");
    await setMealDates(id, "2025-01-15", parisTime(10, 18));

    await sendMealDayReminders(parisTime(14, 12));
    await sendMealDayReminders(parisTime(15, 21, 15));
    assert.equal(await mealDayRemindedAt(id), null);
  });

  test("créé le jour même : tout le monde est au courant, pas de rappel", async () => {
    const id = await meal("maison");
    await setMealDates(id, "2025-01-15", parisTime(15, 9));

    await sendMealDayReminders(parisTime(15, 10));
    assert.equal(await mealDayRemindedAt(id), null);
  });

  test("seulement chez quelqu'un, pas une commande ni un resto", async () => {
    const commande = await meal("commande");
    const resto = await meal("resto");
    await setMealDates(commande, "2025-01-15", parisTime(10, 18));
    await setMealDates(resto, "2025-01-15", parisTime(10, 18));

    await sendMealDayReminders(parisTime(15, 10));
    assert.equal(await mealDayRemindedAt(commande), null);
    assert.equal(await mealDayRemindedAt(resto), null);
  });
});
