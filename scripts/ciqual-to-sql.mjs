#!/usr/bin/env node
// Convertit la table Ciqual (Anses) en migration SQL pour public.foods.
//
// Source : « Table de composition nutritionnelle des aliments Ciqual 2025 », Anses,
// https://doi.org/10.57745/RDMHWY, Licence Ouverte Etalab 2.0 (réutilisation libre en citant la
// source et sa date). Les fichiers bruts ne sont pas versionnés : on les télécharge depuis la page
// du DOI, puis :
//
//   node scripts/ciqual-to-sql.mjs <dossier des XML> > supabase/migrations/<horodatage>_foods_ciqual.sql
//
// Lit alim (les aliments), alim_grp (leurs sous-groupes) et compo (les teneurs), garde les quatre
// constituants que l'app affiche, pour 100 g.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Codes des constituants (const_*.xml).
const CONSTITUENTS = {
  328: "kcal", // Énergie, règlement UE 1169/2011 (kcal/100 g)
  25000: "protein_g", // Protéines, N x facteur de Jones (g/100 g)
  31000: "carbs_g", // Glucides (g/100 g)
  40000: "fat_g", // Lipides (g/100 g)
};

const dir = process.argv[2];
if (!dir) {
  console.error("Usage : node scripts/ciqual-to-sql.mjs <dossier des XML Ciqual>");
  process.exit(1);
}

function readTable(prefix) {
  const file = readdirSync(dir).find((name) => name.startsWith(prefix) && name.endsWith(".xml"));
  if (!file) throw new Error(`Fichier ${prefix}*.xml introuvable dans ${dir}`);
  return readFileSync(join(dir, file), "utf8");
}

const ENTITIES = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&apos;": "'", "&quot;": '"' };
function decode(text) {
  return text.replace(/&(lt|gt|amp|apos|quot);/g, (entity) => ENTITIES[entity]).trim();
}

// Les fichiers sont plats et réguliers (<ALIM><champ> valeur </champ>…</ALIM>) : une expression
// régulière par enregistrement suffit, sans bibliothèque XML.
function* records(xml, tag) {
  const recordPattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  for (const [, body] of xml.matchAll(recordPattern)) {
    const fields = {};
    for (const [, name, value] of body.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) {
      fields[name] = decode(value);
    }
    yield fields;
  }
}

// Une teneur : « 12,5 » → 12.5 ; « traces » et « < 0,5 » (sous le seuil de mesure) → 0 ;
// « - » (non mesuré) → null, jamais inventé.
export function parseContent(text) {
  const value = text.trim();
  if (value === "" || value === "-") return null;
  if (value === "traces" || value.startsWith("<")) return 0;
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100) / 100;
}

function sqlText(text) {
  return `'${text.replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return value === null ? "null" : String(value);
}

const subgroups = new Map();
for (const group of records(readTable("alim_grp_"), "ALIM_GRP")) {
  subgroups.set(group.alim_ssgrp_code, group.alim_ssgrp_nom_fr);
}

const foods = new Map();
for (const food of records(readTable("alim_2"), "ALIM")) {
  const id = Number(food.alim_code);
  if (!Number.isInteger(id) || !food.alim_nom_fr) continue;
  const subgroup = subgroups.get(food.alim_ssgrp_code);
  foods.set(id, {
    id,
    name: food.alim_nom_fr.slice(0, 200),
    groupName: subgroup && subgroup !== "-" ? subgroup.slice(0, 120) : null,
    kcal: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
  });
}

for (const compo of records(readTable("compo_"), "COMPO")) {
  const column = CONSTITUENTS[Number(compo.const_code)];
  const food = foods.get(Number(compo.alim_code));
  if (column && food && compo.teneur !== undefined) food[column] = parseContent(compo.teneur);
}

const rows = [...foods.values()].sort((a, b) => a.id - b.id);
const lines = rows.map(
  (food) =>
    `  (${food.id}, ${sqlText(food.name)}, ${food.groupName ? sqlText(food.groupName) : "null"}, ` +
    `${sqlNumber(food.kcal)}, ${sqlNumber(food.protein_g)}, ${sqlNumber(food.carbs_g)}, ${sqlNumber(food.fat_g)})`,
);

process.stdout.write(`-- Aliments de la table Ciqual 2025 (Anses), générés par scripts/ciqual-to-sql.mjs.
-- Source : https://doi.org/10.57745/RDMHWY, version 1.0 du 2025-11-19, Licence Ouverte Etalab 2.0.
-- Valeurs pour 100 g. « traces » et « < x » → 0 ; non mesuré → null. Ne pas modifier à la main :
-- relancer le script sur une nouvelle version de la table.
-- ${rows.length} aliments.

insert into public.foods (id, name, group_name, kcal, protein_g, carbs_g, fat_g) values
${lines.join(",\n")}
on conflict (id) do update set
  name = excluded.name,
  group_name = excluded.group_name,
  kcal = excluded.kcal,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g;
`);
