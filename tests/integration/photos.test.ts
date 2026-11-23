// Photo de profil (migration profile_photo, src/lib/photo-storage.ts) sur la base locale :
// qui peut envoyer, qui peut voir, et ce qui reste quand on change, retire ou supprime.
// Lancer avec `bash tests/integration/run.sh` (Supabase local démarré).
//
// Rôles : Alice et Bea partagent un foyer, Dan ne connaît personne.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { deleteAccount } from "../../src/lib/account.ts";
import {
  clearPhotoUrlCache,
  getPhotoUrl,
  removeProfilePhoto,
  uploadProfilePhoto,
} from "../../src/lib/photo-storage.ts";
import {
  cleanUp,
  createGroup,
  createUser,
  listPhotos,
  signInAs,
  signInAsNewGuest,
  userExists,
  type TestUser,
} from "./fixtures.ts";
import { supabase } from "./supabase-test-client.ts";

let alice: TestUser;
let bea: TestUser;
let dan: TestUser;

before(async () => {
  alice = await createUser("Alice");
  bea = await createUser("Bea");
  dan = await createUser("Dan");
  await createGroup(alice, [bea]);
});

after(cleanUp);

// Le contenu importe peu : le serveur contrôle le type déclaré et la taille.
const photo = (size = 2048) => new Uint8Array(size).fill(7);

async function myPhotoPath(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const { data: profile } = await supabase
    .from("profiles")
    .select("photo_path")
    .eq("id", data.session?.user.id ?? "")
    .single();
  return profile?.photo_path ?? null;
}

describe("photo de profil", () => {
  test("envoyée : enregistrée sur le profil, visible par les co-membres seulement", async () => {
    await signInAs(bea);
    const path = await uploadProfilePhoto(photo(), null);
    assert.match(path, new RegExp(`^${bea.id}/[0-9a-f-]{36}\\.jpg$`));
    assert.equal(await myPhotoPath(), path);

    clearPhotoUrlCache();
    await signInAs(dan);
    assert.equal(await getPhotoUrl(path), null, "Dan ne partage aucun groupe avec Bea");

    clearPhotoUrlCache();
    await signInAs(alice);
    const url = await getPhotoUrl(path);
    assert.ok(url);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal((await response.arrayBuffer()).byteLength, 2048);
  });

  test("changer de photo supprime l'ancienne ; la retirer vide le dossier", async () => {
    await signInAs(alice);
    const first = await uploadProfilePhoto(photo(), null);
    const second = await uploadProfilePhoto(photo(), first);
    assert.deepEqual(await listPhotos(alice.id), [second]);

    await removeProfilePhoto(second);
    assert.equal(await myPhotoPath(), null);
    assert.deepEqual(await listPhotos(alice.id), []);
  });

  test("le serveur refuse : dossier d'un autre, autre format, plus de 1 Mo, invité", async () => {
    await signInAs(dan);
    const bucket = supabase.storage.from("avatars");
    const other = await bucket.upload(`${bea.id}/intrus.jpg`, photo(), {
      contentType: "image/jpeg",
    });
    assert.ok(other.error, "dossier d'un autre");
    const png = await bucket.upload(`${dan.id}/a.png`, photo(), { contentType: "image/png" });
    assert.ok(png.error, "PNG");
    const big = await bucket.upload(`${dan.id}/gros.jpg`, photo(1024 * 1024 + 1), {
      contentType: "image/jpeg",
    });
    assert.ok(big.error, "plus de 1 Mo");

    await signInAsNewGuest();
    const { data } = await supabase.auth.getSession();
    const guest = await bucket.upload(`${data.session?.user.id}/a.jpg`, photo(), {
      contentType: "image/jpeg",
    });
    assert.ok(guest.error, "un invité n'envoie pas de photo");
  });

  test("le profil ne peut pas pointer vers la photo de quelqu'un d'autre", async () => {
    await signInAs(dan);
    const { error } = await supabase
      .from("profiles")
      .update({ photo_path: `${bea.id}/00000000-0000-4000-8000-000000000000.jpg` })
      .eq("id", dan.id);
    assert.equal(error?.code, "23514");
  });

  test("supprimer son compte efface aussi sa photo", async () => {
    const eve = await createUser("Eve");
    await signInAs(eve);
    await uploadProfilePhoto(photo(), null);
    assert.equal((await listPhotos(eve.id)).length, 1);

    await deleteAccount();
    assert.equal(await userExists(eve.id), false);
    assert.deepEqual(await listPhotos(eve.id), []);
  });
});
