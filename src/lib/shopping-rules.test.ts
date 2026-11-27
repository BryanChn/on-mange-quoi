import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSuggestions,
  cleanShoppingInput,
  clockLabel,
  aisleFromCiqualGroup,
  ciqualMatchesLabel,
  findDuplicate,
  resolveAisle,
  groupShoppingItems,
  guessAisle,
  moveAisle,
  orderedAisles,
  SHOPPING_AISLES,
  normalizeLabel,
  planShoppingAdditions,
  sortShoppingList,
  byAddedOrder,
  tripToShow,
  type ShoppingItem,
} from "./shopping-rules.ts";

function item(id: string, createdAt: string, checkedAt: string | null = null): ShoppingItem {
  return {
    id,
    label: id,
    quantity: null,
    addedBy: null,
    checkedAt,
    checkedBy: null,
    createdAt,
    aisle: "autres",
    isImportant: false,
  };
}

test("liste : ce qui reste à acheter d'abord (ordre d'ajout), puis le dernier pris en tête", () => {
  const sorted = sortShoppingList([
    item("pain", "2026-11-24T10:02:00Z", "2026-11-24T18:01:00Z"),
    item("lait", "2026-11-24T10:01:00Z"),
    item("oeufs", "2026-11-24T10:00:00Z", "2026-11-24T18:05:00Z"),
    item("beurre", "2026-11-24T10:03:00Z"),
  ]);
  assert.deepEqual(
    sorted.map((entry) => entry.id),
    ["lait", "beurre", "oeufs", "pain"],
  );
});

test("liste : des articles ajoutés au même instant gardent toujours le même ordre", () => {
  const sameTime = "2026-11-24T10:00:00Z";
  const items = [
    item("c", sameTime),
    item("a", sameTime),
    item("b", sameTime, "2026-11-24T18:00:00Z"),
  ];
  assert.deepEqual(
    [...items].sort(byAddedOrder).map((entry) => entry.id),
    ["a", "b", "c"],
  );
  // Un article coché garde sa place : l'ordre ne dépend que de l'ajout.
  assert.deepEqual(
    [
      item("lait", "2026-11-24T10:02:00Z", "2026-11-24T18:00:00Z"),
      item("pain", "2026-11-24T10:01:00Z"),
    ]
      .sort(byAddedOrder)
      .map((entry) => entry.id),
    ["pain", "lait"],
  );
});

test("liste vide : rien à trier", () => {
  assert.deepEqual(sortShoppingList([]), []);
});

test("saisie : espaces superflus retirés, quantité vide = null", () => {
  assert.deepEqual(cleanShoppingInput("  Lait   demi-écrémé ", " 2  "), {
    label: "Lait demi-écrémé",
    quantity: "2",
  });
  assert.deepEqual(cleanShoppingInput("Pain", "   "), { label: "Pain", quantity: null });
});

test("doublons : majuscules, accents, espaces et « œ » ignorés", () => {
  assert.equal(normalizeLabel("  LAIT   demi-écrémé "), "lait demi-ecreme");
  assert.equal(normalizeLabel("Œufs"), normalizeLabel("oeufs"));
});

test("doublons : trouve l'article déjà là, à acheter ou déjà pris, sauf celui qu'on renomme", () => {
  const lait = item("lait", "2026-11-24T10:00:00Z");
  const pain = { ...item("pain", "2026-11-24T10:01:00Z", "2026-11-24T18:00:00Z"), label: "Pain" };
  const items = [{ ...lait, label: "Lait" }, pain];
  assert.equal(findDuplicate(items, " lait ")?.id, "lait");
  assert.equal(findDuplicate(items, "PAIN")?.id, "pain");
  assert.equal(findDuplicate(items, "Beurre"), null);
  assert.equal(findDuplicate(items, "Lait", "lait"), null);
});

test("suggestions : les plus fréquents d'abord, avec la dernière quantité ; rien de ce qui est déjà là", () => {
  const history = [
    { label: "Pain", quantity: null, clearedAt: "2026-11-10T18:00:00Z" },
    { label: "lait", quantity: "1", clearedAt: "2026-11-10T18:00:00Z" },
    { label: "Lait", quantity: "2", clearedAt: "2026-11-17T18:00:00Z" },
    { label: "Beurre", quantity: null, clearedAt: "2026-11-20T18:00:00Z" },
    { label: "Œufs", quantity: "12", clearedAt: "2026-11-21T18:00:00Z" },
  ];
  const current = [{ ...item("x", "2026-11-24T10:00:00Z"), label: "oeufs" }];
  assert.deepEqual(buildSuggestions(history, current), [
    { label: "Lait", quantity: "2" },
    { label: "Beurre", quantity: null },
    { label: "Pain", quantity: null },
  ]);
  assert.equal(buildSuggestions(history, [], 2).length, 2);
});

test("clockLabel : « 19 h 40 », « 9 h 05 »", () => {
  assert.equal(clockLabel(new Date(2026, 10, 25, 19, 40)), "19 h 40");
  assert.equal(clockLabel(new Date(2026, 10, 25, 9, 5)), "9 h 05");
});

test("tripToShow : le mien d'abord, sinon le plus récent des autres, sinon rien", () => {
  const lea = { shopperId: "lea", endsAt: "2026-11-25T19:40:00Z" };
  const me = { shopperId: "me", endsAt: "2026-11-25T19:00:00Z" };
  assert.deepEqual(tripToShow([lea, me], "me"), { trip: me, isMine: true });
  assert.deepEqual(tripToShow([lea], "me"), { trip: lea, isMine: false });
  assert.equal(tripToShow([], "me"), null);
});

test("ajouter une recette aux courses : sans doublon, ce qui est pris revient", () => {
  const item = (id: string, label: string, checkedAt: string | null = null): ShoppingItem => ({
    id,
    label,
    quantity: null,
    addedBy: null,
    checkedAt,
    checkedBy: null,
    aisle: "autres",
    isImportant: false,
    createdAt: "2026-11-26T10:00:00Z",
  });
  const plan = planShoppingAdditions(
    [
      { label: "Plat de côte", quantity: "350 g", foodId: 42 },
      { label: "Carottes", quantity: "2" },
      { label: "carottes", quantity: "1" },
      { label: "Bouquet garni", quantity: "1" },
      { label: "Poireaux", quantity: "1" },
      { label: "  ", quantity: null },
    ],
    [item("a", "Bouquet garni"), item("b", "Poireaux", "2026-11-25T18:00:00Z")],
  );
  assert.deepEqual(plan, {
    // L'aliment Ciqual suit l'article : son rayon en dépend.
    toInsert: [
      { label: "Plat de côte", quantity: "350 g", foodId: 42 },
      { label: "Carottes", quantity: "2", foodId: null },
    ],
    toUncheck: ["b"],
    alreadyToBuy: ["Bouquet garni"],
  });
});

// Une centaine d'articles courants, placés comme en magasin (rayons Carrefour, Leclerc).
const AISLE_REFERENCE: Record<string, string[]> = {
  fruits_legumes: [
    "Tomates",
    "Tomates cerises",
    "Pommes",
    "Bananes",
    "Citrons",
    "Salade",
    "Laitue",
    "Carottes",
    "Oignons",
    "Ail",
    "Pommes de terre",
    "Courgettes",
    "Poivrons",
    "Champignons de Paris",
    "Avocats",
    "Persil",
    "Fraises",
    "Raisin",
    "Concombre",
    "Échalotes",
    "Brocoli",
    "Herbes fraîches",
    "Petits pois",
  ],
  boucherie_poisson: [
    "Poulet",
    "Steak haché",
    "Escalopes de dinde",
    "Rôti de porc",
    "Côtes d'agneau",
    "Saumon",
    "Crevettes",
    "Filets de cabillaud",
    "Bœuf bourguignon",
    "Merguez",
  ],
  charcuterie_traiteur: [
    "Jambon",
    "Lardons",
    "Saucisson",
    "Chorizo",
    "Pâte feuilletée",
    "Pâte brisée",
    "Pâtes fraîches",
    "Houmous",
    "Taboulé",
    "Surimi",
    "Knacki",
    "Gnocchi",
  ],
  cremerie: [
    "Lait",
    "Lait demi-écrémé",
    "Œufs",
    "Beurre",
    "Yaourts",
    "Crème fraîche",
    "Emmental râpé",
    "Parmesan",
    "Mozzarella",
    "Fromage blanc",
    "Comté",
    "Petits suisses",
    "Camembert",
    "Crème dessert",
  ],
  boulangerie: ["Pain", "Baguette", "Pain de mie", "Croissants", "Brioche", "Tortillas"],
  epicerie_salee: [
    "Pâtes",
    "Spaghetti",
    "Riz",
    "Farine",
    "Huile d'olive",
    "Sel",
    "Poivre",
    "Moutarde",
    "Mayonnaise",
    "Ketchup",
    "Sauce tomate",
    "Thon en boîte",
    "Lentilles",
    "Pois chiches",
    "Chips",
    "Bouillon cube",
    "Vinaigre",
    "Olives",
    "Cornichons",
    "Lait de coco",
    "Semoule",
    "Épices",
  ],
  epicerie_sucree: [
    "Sucre",
    "Chocolat",
    "Café",
    "Thé",
    "Biscuits",
    "Confiture",
    "Miel",
    "Céréales",
    "Nutella",
    "Compote",
    "Pain d'épices",
    "Amandes",
    "Pâte à tartiner",
    "Barres de céréales",
    "Sirop d'érable",
  ],
  surgeles: ["Glaces", "Glace vanille", "Frites surgelées", "Petits pois surgelés", "Glaçons"],
  boissons: [
    "Eau",
    "Eau gazeuse",
    "Jus d'orange",
    "Jus de pomme",
    "Vin rouge",
    "Bière",
    "Coca",
    "Sirop de menthe",
    "Thé glacé",
  ],
  bebe: ["Couches", "Lingettes", "Lait bébé", "Petits pots", "Purée bébé"],
  animaux: ["Croquettes", "Croquettes pour chat", "Pâtée", "Litière", "Friandises pour chien"],
  maison_hygiene: [
    "Papier toilette",
    "Essuie-tout",
    "Liquide vaisselle",
    "Pastilles lave-vaisselle",
    "Lessive",
    "Éponges",
    "Sacs poubelle",
    "Gel douche",
    "Shampoing",
    "Dentifrice",
    "Mouchoirs",
    "Déodorant",
    "Bougies d'anniversaire",
  ],
  autres: ["Pizza maison", "Ballons", "Cadeau pour Léa"],
};

test("rayon deviné : une centaine d'articles courants, placés comme en magasin", () => {
  const wrong: string[] = [];
  for (const [aisle, labels] of Object.entries(AISLE_REFERENCE)) {
    for (const label of labels) {
      const guessed = guessAisle(label);
      if (guessed !== aisle) wrong.push(`${label} : ${guessed} au lieu de ${aisle}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test("rayon : le choix du foyer passe avant la devinette", () => {
  const chosen = new Map([["lait de coco", "cremerie" as const]]);
  assert.equal(guessAisle("  Lait de COCO ", chosen), "cremerie");
  assert.equal(guessAisle("Lait", chosen), "cremerie");
});

test("ordre des rayons : complété, « autres » toujours en dernier", () => {
  assert.deepEqual(orderedAisles(null), SHOPPING_AISLES);
  const saved = orderedAisles(["boissons", "autres", "cremerie"]);
  assert.equal(saved[0], "boissons");
  assert.equal(saved[1], "cremerie");
  assert.equal(saved.at(-1), "autres");
  assert.equal(new Set(saved).size, SHOPPING_AISLES.length);

  const order = orderedAisles(null);
  assert.equal(moveAisle(order, "boulangerie", -1)[0], "boulangerie");
  assert.deepEqual(moveAisle(order, "fruits_legumes", -1), order);
  // L'avant-dernier ne passe pas après « autres », et « autres » ne bouge pas.
  assert.deepEqual(moveAisle(order, "maison_hygiene", 1), order);
  assert.deepEqual(moveAisle(order, "autres", -1), order);
});

test("sections : indispensables en tête, puis les rayons dans l'ordre, les pris restent dans leur rayon", () => {
  const items = [
    { id: "lait", aisle: "cremerie" as const, isImportant: false },
    { id: "pain", aisle: "boulangerie" as const, isImportant: false },
    { id: "couches", aisle: "bebe" as const, isImportant: true },
    { id: "beurre", aisle: "cremerie" as const, isImportant: false },
  ];
  assert.deepEqual(
    groupShoppingItems(items, orderedAisles(null)).map((group) => [
      group.key,
      group.items.map((item) => item.id),
    ]),
    [
      ["important", ["couches"]],
      ["boulangerie", ["pain"]],
      ["cremerie", ["lait", "beurre"]],
    ],
  );
});

// Les sous-groupes Ciqual 2025 sans « alimentation particulière » (foods.group_name), relevés en
// base : chacun doit avoir un rayon.
const CIQUAL_SUBGROUPS = [
  "aides culinaires",
  "algues",
  "autres matières grasses",
  "autres produits à base de viande",
  "barres céréalières",
  "beurres",
  "biscuits apéritifs",
  "biscuits sucrés",
  "boisson alcoolisées",
  "boissons sans alcool",
  "céréales de petit-déjeuner",
  "céréales et biscuits infantiles",
  "charcuteries et alternatives végétales",
  "chocolats et produits à base de chocolat",
  "condiments",
  "confiseries non chocolatées",
  "confitures et assimilés",
  "crèmes et spécialités à base de crème",
  "desserts glacés",
  "desserts infantiles",
  "eaux",
  "épices",
  "farines",
  "feuilletées et autres entrées",
  "fromages et alternatives végétales",
  "fruits",
  "fruits à coque et graines oléagineuses",
  "gâteaux et pâtisseries",
  "glaces",
  "herbes",
  "huiles de poissons",
  "huiles et graisses végétales",
  "ingrédients pour végétariens",
  "laits",
  "laits et boissons infantiles",
  "légumes",
  "légumineuses",
  "margarines",
  "mollusques et crustacés crus",
  "mollusques et crustacés cuits",
  "oeufs",
  "pains et assimilés",
  "pâtes à tarte",
  "pâtes, riz et céréales",
  "petits pots salés et plats infantiles",
  "pizzas, tartes et crêpes salées",
  "plats composés",
  "poissons crus",
  "poissons cuits",
  "pommes de terre et autres tubercules",
  "produits à base de poissons et produits de la mer",
  "produits laitiers frais et alternatives végétales",
  "salades composées et crudités",
  "sandwichs",
  "sauces",
  "sels",
  "sorbets",
  "soupes",
  "sucres, miels et assimilés",
  "tartinables végétariens",
  "viandes crues",
  "viandes cuites",
  "viennoiseries",
];

test("Ciqual : chaque sous-groupe d'aliments a un rayon", () => {
  const missing = CIQUAL_SUBGROUPS.filter((group) => aisleFromCiqualGroup(group) === null);
  assert.deepEqual(missing, []);
  assert.equal(aisleFromCiqualGroup("viandes cuites"), "charcuterie_traiteur");
  assert.equal(aisleFromCiqualGroup(null), null);
  assert.equal(aisleFromCiqualGroup("inconnu"), null);
});

test("Ciqual : l'aliment trouvé doit commencer comme le nom tapé", () => {
  assert.ok(ciqualMatchesLabel("Goûter", "Goûter sec fourré, au chocolat"));
  assert.ok(ciqualMatchesLabel("Échines de porc", "Échine de porc, crue"));
  assert.ok(!ciqualMatchesLabel("Ballons", "Pain de mie, complet"));
  assert.ok(!ciqualMatchesLabel("Ok", "Okra, cru"));
});

test("rayon d'un nouvel article : choix du foyer, dictionnaire, Ciqual, puis Autres", () => {
  const chosen = new Map([["goute", "boulangerie" as const]]);
  assert.equal(resolveAisle("Goûté", chosen, "biscuits sucrés"), "boulangerie");
  assert.equal(resolveAisle("Lait", new Map(), "boissons sans alcool"), "cremerie");
  assert.equal(resolveAisle("Goûter", new Map(), "biscuits sucrés"), "epicerie_sucree");
  assert.equal(resolveAisle("Ballons", new Map(), null), "autres");
});
