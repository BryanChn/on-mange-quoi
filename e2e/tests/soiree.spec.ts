// Une soirée vue par deux invités sans l'app, chacun dans son navigateur : rejoindre par le
// lien, commander, voir la commande de l'autre en direct (même après une coupure du temps
// réel) et partager le récap.
import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from "@playwright/test";

import { cleanup, createSoireeReadyToOrder } from "../fixtures.ts";
import { BASE_URL } from "../playwright.config.ts";

// Contextes ouverts par joinAsGuest. L'option `trace` de la config ne vaut que pour le
// contexte par défaut : ici, chaque invité enregistre sa trace, gardée si le test échoue.
const openContexts: { name: string; context: BrowserContext }[] = [];

test.afterEach(async ({}, testInfo) => {
  const failed = testInfo.status !== testInfo.expectedStatus;
  for (const { name, context } of openContexts) {
    await context.tracing.stop(
      failed ? { path: testInfo.outputPath(`trace-${name}.zip`) } : undefined,
    );
    await context.close();
  }
  openContexts.length = 0;
});

test.afterAll(cleanup);

type Guest = {
  page: Page;
  // Coupe le temps réel de ce navigateur et refuse les reconnexions, le reste du réseau
  // passe : comme un téléphone qui revient de WhatsApp avec une connexion Realtime morte.
  cutRealtime: () => Promise<void>;
  restoreRealtime: () => void;
};

async function joinAsGuest(browser: Browser, joinToken: string, name: string): Promise<Guest> {
  // Un contexte = un navigateur isolé (stockage, session) : deux invités distincts.
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "fr-FR",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  openContexts.push({ name, context });
  const page = await context.newPage();

  const sockets = new Set<WebSocketRoute>();
  let isCut = false;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
    if (isCut) {
      void socket.close();
      return;
    }
    socket.connectToServer();
    sockets.add(socket);
  });

  await page.goto(`${BASE_URL}/rejoindre/${joinToken}`);
  await page.getByLabel("Ton prénom ou pseudo").fill(name);
  await page.getByRole("button", { name: "Rejoindre la soirée" }).click();
  await expect(page.getByLabel("Ce que tu prends")).toBeVisible();

  return {
    page,
    cutRealtime: async () => {
      isCut = true;
      for (const socket of sockets) await socket.close();
      sockets.clear();
    },
    restoreRealtime: () => {
      isCut = false;
    },
  };
}

async function addLine(page: Page, label: string, note = ""): Promise<void> {
  // Le libellé change une fois la première ligne ajoutée.
  await page.getByLabel(/^(Ce que tu prends|Autre chose \?)$/).fill(label);
  if (note) await page.getByLabel("Remarque (facultatif)").fill(note);
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
}

// Une ligne du récap, telle que TalkBack la lit (une seule étiquette par ligne).
function recapLine(page: Page, text: string) {
  return page.getByLabel(text, { exact: true });
}

test("deux invités commandent ensemble, en direct, même après une coupure du temps réel", async ({
  browser,
}) => {
  const soiree = await createSoireeReadyToOrder("Chez Momo", "Sam");
  const lea = await joinAsGuest(browser, soiree.joinToken, "Léa");
  const tom = await joinAsGuest(browser, soiree.joinToken, "Tom");

  // Léa commande : Tom la voit sans recharger, Léa se voit en « toi ».
  await addLine(lea.page, "Kebab", "sans oignon");
  await expect(recapLine(lea.page, "1 Kebab, sans oignon : toi")).toBeVisible();
  await expect(recapLine(tom.page, "1 Kebab, sans oignon : Léa")).toBeVisible();

  // Tom perd le temps réel pendant que Léa ajoute des frites : il ne peut pas les voir…
  await tom.cutRealtime();
  await addLine(lea.page, "Frites");
  await expect(recapLine(lea.page, "1 Frites : toi")).toBeVisible();
  // Attente voulue : avec un temps réel vivant, la ligne arriverait en moins de 2 s. Sans
  // elle, une coupure ratée laisserait passer le test sans rien prouver.
  await tom.page.waitForTimeout(2_000);
  await expect(recapLine(tom.page, "1 Frites : Léa")).toHaveCount(0);

  // …mais elles apparaissent dès la reconnexion, sans quitter l'écran (PR #82).
  // Realtime retente après 1, 2, 5 puis 10 s : jusqu'à 20 s d'attente.
  tom.restoreRealtime();
  await expect(recapLine(tom.page, "1 Frites : Léa")).toBeVisible({ timeout: 20_000 });

  // Le récap partagé (copié sur le web) : vrais prénoms, jamais « toi », et qui manque.
  await tom.page.getByRole("button", { name: "Partager le récap" }).click();
  await expect(tom.page.getByText("Récap copié, colle-le dans WhatsApp.")).toBeVisible();
  const recap = await tom.page.evaluate(() => navigator.clipboard.readText());

  expect(recap).toContain("*Chez Momo* · commande ouverte");
  expect(recap).toContain("2 articles · 1 personne sur 3");
  expect(recap).toContain("Léa : Kebab (sans oignon), Frites");
  expect(recap).toContain("Pas encore commandé : Sam, Tom");
  expect(recap).toContain(`Pour commander : `);
  // Le mot entier : « comptoir » contient « toi ».
  expect(recap).not.toMatch(/\btoi\b/);
});
